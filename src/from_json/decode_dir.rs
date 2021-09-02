use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::RootTag;
use serde_json;
use std::path::Path;

impl RootTag {
	pub fn from_dir<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<Self> {
		let path = path.as_ref();

		let manifest_path = path.join("collagen.json");
		// println!("{:?}", std::env::current_dir());
		// println!("{:?}", path);
		// println!("{:?}", manifest_path.exists());
		let reader = std::fs::File::open(&manifest_path)?;
		let root = serde_json::from_reader::<_, RootTag>(reader)?;

		Ok(root)
	}
}
