mod decoding_error;

use serde_json::{from_reader as json_from_reader, Value as JsonValue};
use zip::read::ZipArchive;

use std::fs::read_dir;
use std::fs::File;
use std::io;

use std::path::Path;

use decoding_error::ClgnDecodingError;

type JsonResult = std::result::Result<JsonValue, ClgnDecodingError>;

enum UnzippedFileCount<'a> {
	Zero,
	One(&'a Path),
	TwoOrMore
}

fn unzip_and_do_with_tempdir<F, T>(src: &Path, f: F) -> Result<T, ClgnDecodingError>
where
	F: FnOnce(&Path) -> Result<T, ClgnDecodingError>,
{
	let reader = File::open(src)?;
	let mut archive = ZipArchive::new(reader)?;

	let temp_dir = tempfile::tempdir()?;
	archive.extract(&temp_dir)?;
	f(temp_dir.path())
}

pub fn get_manifest_json_from_zip_path<S: AsRef<Path>>(src: S) -> JsonResult {
	let path = src.as_ref();
	// TODO: Figure out a better way to detect whether the zip is unzipped into a
	// container directory within the temp dir or if its contents are dropped directly
	// into the temp dir
	unzip_and_do_with_tempdir(path, |temp_dir| {
		// None -> there were no files
		// Some((1, path)) -> there was one file, and it's the zip container directory
		// Some((>=2, _)) -> there was >1 file and so there's no zip container directory
		let file_count_path: UnzippedFileCount =
			read_dir(temp_dir)?.fold(UnzippedFileCount::Zero, |acc, this| {
				let this = match this {
					Ok(path) => path,
					Err(_) => return acc,
				};

				let path = this.path();
				match acc {
					UnzippedFileCount::Zero => UnzippedFileCount::One(&path),
					_ => UnzippedFileCount::TwoOrMore,
				}
			});

		let prefix = match file_count_path {
			UnzippedFileCount::Zero => return Err(ClgnDecodingError::Io(io::Error::new(
				io::ErrorKind::NotFound,
				"When unzipped, there were no files",
			))),
			UnzippedFileCount::One(path) => {
				let ps = path.to_str();
				match ps {
					Some(s) =>  s.to_owned() + "/",
					None => return Err(ClgnDecodingError::Io(io::Error::new(
						io::ErrorKind::InvalidData,
						"When unzipped, there was one item, whose filename could not be decoded"
					))),

				}
			}
		};



		let file_count = file_count_path.0;
		if file_count == 0

		let prefix = match file_count_path {
			None => return,
			Some((1, path)) => {
				let ps = path.to_str();
				match ps {
					Some(s) => s,
					None => {
						return Err(ClgnDecodingError::Io(io::Error::new(
							io::ErrorKind::InvalidData,
							"When unzipped, there as an invalid path string",
						)))
					}
				}
			}
			Some(_) => "",
		};

		let prefix: &str;
		if file_count == 0 {
			return;
		} else if file_count == 1 {
			prefix = "a"
		}
		let manifest_path = temp_dir.join("collagen.json");
		println!("{:?}", manifest_path);
		let reader = File::open(&manifest_path)?;
		json_from_reader(reader).map_err(ClgnDecodingError::from)
	})
}
