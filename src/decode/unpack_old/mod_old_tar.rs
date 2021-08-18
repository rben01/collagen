mod decoding_error;

use serde_json::{from_reader as json_from_reader, Value as JsonValue};
use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::path::Path;

use unicode_normalization::UnicodeNormalization;

use decoding_error::ClgnDecodingError;

type JsonResult = std::result::Result<JsonValue, ClgnDecodingError>;

type TarIndex<'a, R> = HashMap<String, tar::Entry<'a, R>>;

fn tar_json_entry_to_json<R: io::Read>(entry: tar::Entry<R>) -> JsonResult {
	let json = json_from_reader(entry);
	match json {
		Ok(json) => return Ok(json),
		Err(err) => return Err(ClgnDecodingError::JsonDecode(err)),
	}
}

pub fn build_tar_index<R: io::Read>(
	archive: &mut tar::Archive<R>,
) -> Result<TarIndex<'_, R>, ClgnDecodingError> {
	let path_entry_map: HashMap<_, _> = archive
		.entries()?
		.filter_map(|entry| {
			let entry = match entry {
				Ok(entry) => entry,
				Err(_) => {
					// TODO: Handle error?
					// Err(ClgnDecodingError::from(err))
					return None;
				}
			};

			let maybe_path_entry = entry
				.path()
				.map_err(ClgnDecodingError::from)
				.and_then(|path| {
					path.to_str()
						.map(|s| s.to_owned().nfc().to_string())
						.ok_or(ClgnDecodingError::UnicodeError)
				})
				.map(|path_str| (path_str, entry))
				// TODO: Handle error?
				.ok();

			maybe_path_entry
		})
		.collect();

	Ok(path_entry_map)
}

pub fn read_manifest_json_from_tar_index<R: io::Read>(ti: TarIndex<'_, R>) -> JsonResult {
	let index_key = "collagen.json"; // Do we need to make this flexible?
	let entry = ti.get(index_key).ok_or(ClgnDecodingError::MissingManifest);
	let json_result =
		entry.and_then(|entry| json_from_reader((*entry).into()).map_err(ClgnDecodingError::from));
	json_result
}

/// This is a comment
pub fn read_tar_to_json<P: AsRef<Path>>(tarfile_path: P) -> JsonResult {
	let reader = File::open(tarfile_path)?;
	let mut archive = tar::Archive::new(reader);
	for entry in archive.entries()? {
		let entry = entry?;
		let path = entry.path();
		println!("{:?}", path);
	}
	for entry in archive.entries()? {
		let entry = entry?;
		let path = entry.path();

		match path {
			Ok(path) => {
				let path_str = path.to_str().to_owned();
				if let Some(path_str) = path_str {
					if path_str == "collagen.json" {
						return tar_json_entry_to_json(entry);
					}
				}
			}
			Err(_) => {
				continue;
			}
		}
	}
	return Err(ClgnDecodingError::MissingManifest);
}

// pub fn<T:Fn<Path>> f() -> i32 {
// 	return decode::read_tar_to_json;
// 		1
// }
