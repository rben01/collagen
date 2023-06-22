//! Implements the decoding methods for [`Fibroblast`], which let you produce a
//! `Fibroblast` from some serialized data (e.g. a directory with the necessary manifest
//! and files)

use super::decoding_error::{ClgnDecodingError, ClgnDecodingResult};
use crate::fibroblast::{data_types::DecodingContext, tags::root_tag::RootTag, Fibroblast};
use serde_json;
use std::path::{Path, PathBuf};

impl<'a> Fibroblast<'a> {
	pub fn from_dir(path: PathBuf) -> ClgnDecodingResult<Self> {
		let context = DecodingContext::new_at_root(path.clone());
		Fibroblast::from_dir_with_context(path, context)
	}

	pub fn from_dir_with_context(
		path: impl AsRef<Path>,
		context: DecodingContext<'a>,
	) -> ClgnDecodingResult<Self> {
		let path = path.as_ref();

		let manifest_path = path.join("collagen.json");
		let reader = std::fs::File::open(&manifest_path)
			.map_err(|e| ClgnDecodingError::Io(e, manifest_path.clone()))?;
		let root = serde_json::from_reader::<_, RootTag>(reader)
			.map_err(|e| ClgnDecodingError::JsonDecode(e, manifest_path))?
			.validate()?;

		Ok(Fibroblast { root, context })
	}
}
