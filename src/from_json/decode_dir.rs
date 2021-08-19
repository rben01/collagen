use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::RootTag;
use serde_json;
use std::path::Path;
use std::path::PathBuf;

impl RootTag {
	fn from_dir_path(path: PathBuf) -> ClgnDecodingResult<Self> {
		let manifest_path = path.join("collagen.json");
		let reader = std::fs::File::open(&manifest_path)?;
		let root = serde_json::from_reader::<_, RootTag>(reader)?;

		Ok(root)
	}

	pub fn from_dir<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<Self> {
		Self::from_dir_path(path.as_ref().to_path_buf())
	}
}
