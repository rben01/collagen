use super::decoding_error::ClgnDecodingError;
use serde_json;
use serde_json::Value as JsonValue;
use std::{fs, io, path};

fn parse_folder_path_to_json(path: &path::Path) -> Result<JsonValue, ClgnDecodingError> {
	let manifest_path = path.join("collagen.json");
	let file = fs::File::open(manifest_path)?;
	let buf_reader = io::BufReader::new(file);

	serde_json::from_reader(buf_reader).map_err(ClgnDecodingError::from)
}

pub fn parse_folder_to_json<P: AsRef<path::Path>>(path: P) -> Result<JsonValue, ClgnDecodingError> {
	parse_folder_path_to_json(path.as_ref())
}
