use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::{Fibroblast, RootTag};
use serde_json;
use std::path::Path;
use std::path::PathBuf;

impl Fibroblast {
	fn from_folder_path(path: PathBuf) -> ClgnDecodingResult<Self> {
		let manifest_path = path.join("collagen.json");
		let reader = std::fs::File::open(&manifest_path)?;
		let root = serde_json::from_reader::<_, RootTag>(reader)?;

		let s = Self::new(root, manifest_path);

		Ok(s)
	}

	pub fn from_folder<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<Self> {
		let s = Self::from_folder_path(path.as_ref().to_path_buf())?;

		// let root = s.root();
		// let manifest_path = path.as_ref().to_path_buf();
		// root.add_manifest_path_to_children(&manifest_path);
		// // drop(s)
		// println!("{:?}", root);

		Ok(s)
	}
}

pub fn parse_folder_to_svg<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<String> {
	Fibroblast::from_folder(path)?.to_svg()
}
