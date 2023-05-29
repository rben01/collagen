//! The command line interface for this app

use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult, Fibroblast};
use clap::Parser;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use quick_xml::Writer as XmlWriter;
use std::{path::Path, time::Duration};

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

fn create_writer(
	in_folder: impl AsRef<Path>,
	out_file: impl AsRef<Path>,
) -> ClgnDecodingResult<XmlWriter<std::fs::File>> {
	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open(out_file)
		// TODO: replace `unwrap` with `into_ok` when stabilized
		.map_err(|e| ClgnDecodingError::Io(e, in_folder.as_ref().to_owned()))?;
	Ok(XmlWriter::new(file_writer))
}

impl Cli {
	pub fn run(self) -> ClgnDecodingResult<()> {
		use notify::{event::ModifyKind, EventKind::*};

		macro_rules! error {
			($e:expr, $in_folder:expr $(,)?) => {
				eprintln!("Got error {:?} while watching {:?}", $e, $in_folder);
				continue;
			};
		}

		let Self {
			in_folder,
			out_file,
			watch,
			debounce_ms,
		} = self;

		Fibroblast::from_dir(in_folder.clone().into())?
			.to_svg(&mut create_writer(&in_folder, &out_file)?)?;
		if watch {
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

				// I don't fully understand why this can't be written as
				// `Fibroblast::from_dir(...).and_then(|f| f.to_svg(...))`; it runs into
				// some lifetime issues I can't figure out (who cares when the argument to
				// and_then is dropped, it's not used afterwards)
				let f = match Fibroblast::from_dir(in_folder.clone().into()) {
					Ok(f) => f,
					Err(e) => {
						error!(e, in_folder);
					}
				};
				match f.to_svg(&mut create_writer(&in_folder, &out_file)?) {
					Ok(()) => {
						if modified_paths.len() == 1 {
							eprintln!(
								"Observed changes to {:?} in {in_folder:?}; rerunning",
								modified_paths.iter().next().unwrap()
							)
						} else {
							eprintln!(
								"Observed changes to {:?} in {in_folder:?}; rerunning",
								modified_paths
							)
						}
					}
					Err(e) => {
						error!(e, in_folder);
					}
				}
			}
		}

		Ok(())
	}
}
