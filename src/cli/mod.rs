//! The command line interface for this app

use crate::{from_json::decoding_error::ClgnDecodingError, ClgnDecodingResult, Fibroblast};
use clap::{Parser, ValueEnum};
use core::fmt;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use quick_xml::Writer as XmlWriter;
use std::{
	fs,
	io::{BufWriter, Write},
	path::{Path, PathBuf},
	time::Duration,
};

struct Outfile<'a>(&'a Path);

impl Outfile<'_> {
	const STDOUT: &'static str = "-";

	fn is_stdout(&self) -> bool {
		self.0 == Path::new(Self::STDOUT)
	}
}

impl AsRef<Path> for Outfile<'_> {
	fn as_ref(&self) -> &Path {
		self.0
	}
}

impl fmt::Display for Outfile<'_> {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		if self.is_stdout() {
			write!(f, "<stdout>")
		} else {
			write!(f, "{:?}", self.0)
		}
	}
}

#[derive(Debug, Copy, Clone, ValueEnum)]
pub enum ManifestFormat {
	Json,
	Jsonnet,
}

#[derive(Debug, Copy, Clone)]
pub enum ProvidedInput<'a> {
	File { file: &'a Path, parent: &'a Path },
	Folder(&'a Path),
}

impl<'a> ProvidedInput<'a> {
	pub(crate) fn new(canonicalized_path: &'a Path) -> Self {
		let path = canonicalized_path;
		if path.is_dir() {
			Self::Folder(path)
		} else {
			Self::File {
				file: path,
				parent: path
					.parent()
					.unwrap_or_else(|| panic!("could not get parent of {path:?}")),
			}
		}
	}

	pub(crate) fn folder(&self) -> &Path {
		match self {
			ProvidedInput::File { parent, file: _ } => parent,
			ProvidedInput::Folder(p) => p,
		}
	}
}

#[derive(Parser)]
#[command(name = "clgn", about = "Collagen: The Collage Generator")]
pub struct Cli {
	/// The path to the input skeleton folder
	#[arg(short = 'i', long = "input")]
	input: PathBuf,

	/// The path to save the resulting SVG to; if equal to '-', output will instead go to
	/// stdout
	#[arg(short = 'o', long = "out-file")]
	out_file: PathBuf,

	/// The format of the manifest file; if not specified, it will be inferred from the
	/// input
	#[arg(short = 'f', long = "format")]
	format: Option<ManifestFormat>,

	/// If specified, enter watch mode, re-running on any changes inside the skeleton
	/// folder
	#[arg(long)]
	watch: bool,

	/// If watching, how long to wait (in milliseconds) for additional modifications
	/// before triggering a re-run
	#[arg(long = "debounce", default_value_t = 250)]
	debounce_ms: u64,
}

fn map_io_error(path: impl AsRef<Path>) -> impl FnOnce(std::io::Error) -> ClgnDecodingError {
	move |source| ClgnDecodingError::IoWrite {
		source,
		path: path.as_ref().to_owned(),
	}
}

fn create_file_writer(
	out_file: impl AsRef<Path>,
) -> ClgnDecodingResult<XmlWriter<impl std::io::Write>> {
	let f = fs::File::create(&out_file).map_err(map_io_error(out_file.as_ref()))?;

	Ok(XmlWriter::new(f))
}

/// The `BufWriter` must be flushed after writing to this writer
fn create_stdout_writer() -> XmlWriter<BufWriter<std::io::Stdout>> {
	XmlWriter::new(BufWriter::new(std::io::stdout()))
}

fn run_once_result(
	input: ProvidedInput,
	out_file: &Outfile,
	format: Option<ManifestFormat>,
) -> ClgnDecodingResult<()> {
	if out_file.is_stdout() {
		let mut writer = create_stdout_writer();
		Fibroblast::from_dir(input, format)?.to_svg(&mut writer)?;

		let mut stdout_buf = writer.into_inner();
		writeln!(stdout_buf).map_err(map_io_error(Outfile::STDOUT))?;
		stdout_buf.flush().map_err(map_io_error(Outfile::STDOUT))?;

		Ok(())
	} else {
		Fibroblast::from_dir(input, format)?.to_svg(&mut create_file_writer(out_file)?)
	}
}

fn run_once_log(input: ProvidedInput, out_file: &Outfile, format: Option<ManifestFormat>) {
	match run_once_result(input, out_file, format) {
		Ok(()) => eprintln!("Success; output to {out_file}"),
		Err(e) => eprintln!("Error while watching {:?}: {e:?}", input.folder()),
	}
}

impl Cli {
	#[allow(clippy::missing_panics_doc, clippy::missing_errors_doc)]
	pub fn run(self) -> ClgnDecodingResult<()> {
		use notify::{event::ModifyKind, EventKind::*};

		let Self {
			input,
			out_file,
			format,
			watch,
			debounce_ms,
		} = self;

		let out_file = Outfile(&out_file);

		let input = ProvidedInput::new(&input);
		let in_folder = input.folder();

		if watch {
			'check_recursive_watch: {
				if out_file.is_stdout() {
					break 'check_recursive_watch;
				}

				let out_file = &fs::canonicalize(out_file.0.parent().unwrap_or(Path::new(".")))
					.map_err(|source| ClgnDecodingError::FolderDoesNotExist {
						source,
						path: in_folder.to_owned(),
					})?
					.join(out_file.0.file_name().unwrap());

				let in_folder_canon = fs::canonicalize(in_folder).map_err(|source| {
					ClgnDecodingError::FolderDoesNotExist {
						source,
						path: in_folder.to_owned(),
					}
				})?;

				if out_file.starts_with(in_folder_canon) {
					return Err(ClgnDecodingError::RecursiveWatch {
						in_folder: in_folder.to_owned(),
						out_file: out_file.clone(),
					});
				}
			}

			run_once_log(input, &out_file, format);

			let (tx, rx) = std::sync::mpsc::channel();

			let mut debouncer = new_debouncer(
				Duration::from_millis(debounce_ms),
				Some(Duration::from_millis(debounce_ms)),
				tx,
			)?;

			debouncer
				.watcher()
				.watch(Path::new(&in_folder), RecursiveMode::Recursive)?;

			for result in rx {
				let events = result?;
				let modified_paths = events
					.iter()
					.filter_map(|event| match event.kind {
						Any
						| Create(_)
						| Modify(
							ModifyKind::Any
							| ModifyKind::Data(_)
							| ModifyKind::Name(_)
							| ModifyKind::Other,
						)
						| Remove(_)
						| Other => Some(&event.paths),
						Modify(ModifyKind::Metadata(_)) | Access(_) => None,
					})
					.flatten()
					.collect::<crate::utils::Set<_>>();

				if modified_paths.is_empty() {
					continue;
				}

				if modified_paths.len() == 1 {
					eprintln!(
						"Rerunning on {input:?} due to changes to {:?}",
						modified_paths.first().unwrap()
					);
				} else {
					eprintln!("Rerunning on {input:?} due to changes to {modified_paths:?}");
				}

				run_once_log(input, &out_file, format);
			}
		} else {
			run_once_result(input, &out_file, format)?;
		}

		Ok(())
	}
}
