use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::{context::DecodingContext, Fibroblast, RootTag};
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
		let reader = std::fs::File::open(&manifest_path)?;
		let root = serde_json::from_reader::<_, RootTag>(reader)?;

		Ok(Fibroblast { root, context })
	}
}
