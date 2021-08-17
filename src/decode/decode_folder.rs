use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::{RootTag, TagLike};
use serde_json;
use std::{fs, path};

fn parse_folder_path_to_svg(path: &path::Path) -> ClgnDecodingResult<String> {
	let manifest_path = path.join("collagen.json");
	let reader = fs::File::open(manifest_path)?;
	let f = serde_json::from_reader::<_, RootTag>(reader)?;

	f.to_svg()
	// serde_json::from_reader(buf_reader).map_err(ClgnDecodingError::from)
}

pub fn parse_folder_to_svg<P: AsRef<path::Path>>(path: P) -> ClgnDecodingResult<String> {
	parse_folder_path_to_svg(path.as_ref())
}
