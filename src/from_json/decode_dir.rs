//! Implements the decoding methods for [`Fibroblast`], which let you produce a
//! `Fibroblast` from some serialized data (e.g. a directory with the necessary manifest
//! and files)

use super::decoding_error::{ClgnDecodingError, ClgnDecodingResult};
use crate::fibroblast::{data_types::DecodingContext, tags::RootTag, Fibroblast};
use serde_json;
use std::path::Path;

impl<'a> Fibroblast<'a> {
	pub fn from_dir<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<Self> {
		let path = path.as_ref();
		let context = DecodingContext::new_at_root(path);
		Fibroblast::from_dir_with_context(path, context)
	}

	pub fn from_dir_with_context<P: AsRef<Path>>(
		path: P,
		context: DecodingContext<'a>,
	) -> ClgnDecodingResult<Self> {
		let path = path.as_ref();

		let manifest_path = path.join("collagen.json");
		let reader = std::fs::File::open(&manifest_path)
			.map_err(|e| ClgnDecodingError::Io(e, manifest_path.clone()))?;
		let root = serde_json::from_reader::<_, RootTag>(reader)
			.map_err(|e| ClgnDecodingError::JsonDecode(e, manifest_path))?;

		Ok(Fibroblast { root, context })
	}
}
