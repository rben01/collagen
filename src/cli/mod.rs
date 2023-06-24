//! The command line interface for this app

use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult, Fibroblast};
use clap::Parser;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use quick_xml::Writer as XmlWriter;
use std::{fs::canonicalize, path::Path, time::Duration};

#[derive(Parser)]
#[command(name = "clgn", about = "Collagen: The Collage Generator")]
pub struct Cli {
	/// The path to the input skeleton folder
	#[arg(short = 'i', long = "in-folder")]
	in_folder: String,

	/// The path to save the resulting SVG to
	#[arg(short = 'o', long = "out-file")]
	out_file: String,

	/// Whether to watch the skeleton folder and re-run on any changes
	#[arg(long)]
	watch: bool,

	/// If watching, how long to wait (in milliseconds) for additional modifications
	/// before triggering a re-run
	#[arg(long = "debounce", default_value_t = 250)]
	debounce_ms: u64,
}

fn create_writer(out_file: impl AsRef<Path>) -> ClgnDecodingResult<XmlWriter<std::fs::File>> {
	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open(&out_file)
		// TODO: replace `unwrap` with `into_ok` when stabilized
		.map_err(|e| ClgnDecodingError::Io(e, out_file.as_ref().to_owned()))?;
	Ok(XmlWriter::new(file_writer))
}

fn run_once_result(in_folder: &Path, out_file: &Path) -> ClgnDecodingResult<()> {
	Fibroblast::from_dir(in_folder.clone().into())?.to_svg(&mut create_writer(out_file)?)
}

fn run_once_log(in_folder: &Path, out_file: &Path) {
	match run_once_result(in_folder, out_file) {
		Ok(()) => eprintln!("Success; output to {out_file:?}"),
		Err(e) => eprintln!("Error while watching {in_folder:?}: {e:?}"),
	}
}

impl Cli {
	#[allow(clippy::missing_panics_doc, clippy::missing_errors_doc)]
	pub fn run(self) -> ClgnDecodingResult<()> {
		use notify::{event::ModifyKind, EventKind::*};

		let Self {
			in_folder,
			out_file,
			watch,
			debounce_ms,
		} = self;

		let in_folder: &Path = in_folder.as_ref();
		let out_file: &Path = out_file.as_ref();

		if watch {
			{
				let in_folder = canonicalize(in_folder)
					.map_err(|e| ClgnDecodingError::Io(e, in_folder.to_owned()))?;
				let out_file = canonicalize(out_file)
					.map_err(|e| ClgnDecodingError::Io(e, in_folder.clone()))?;

				if out_file.starts_with(&in_folder) {
					return Err(ClgnDecodingError::RecursiveWatch {
						in_folder,
						out_file,
					});
				}
			}

			run_once_log(in_folder, out_file);

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
					.into_iter()
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
						| Other => Some(event.paths),
						Modify(ModifyKind::Metadata(_)) | Access(_) => None,
					})
					.flatten()
					.collect::<crate::utils::Set<_>>();

				if modified_paths.is_empty() {
					continue;
				}

				if modified_paths.len() == 1 {
					eprintln!(
						"Rerunning on {in_folder:?} due to changes to {:?}",
						modified_paths.first().unwrap()
					);
				} else {
					eprintln!("Rerunning on {in_folder:?} due to changes to {modified_paths:?}");
				}

				run_once_log(in_folder, out_file);
			}
		} else {
			run_once_result(in_folder, out_file)?;
		}

		Ok(())
	}
}
