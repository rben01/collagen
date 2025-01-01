//! Implements the decoding methods for [`Fibroblast`], which let you produce a
//! `Fibroblast` from some serialized data (e.g. a directory with the necessary manifest
//! and files)

use super::decoding_error::ClgnDecodingResult;
use crate::fibroblast::{data_types::DecodingContext, tags::root_tag::RootTag, Fibroblast};
use std::path::Path;

impl Fibroblast {
	/// Decode the Fibroblast from the given path
	///
	/// # Errors
	///
	/// If any error occurs whatsoever. See [`ClgnDecodingError`] for possible causes.
	pub fn from_dir(path: &Path) -> ClgnDecodingResult<Self> {
		let context = DecodingContext::new_at_root(path.to_owned());
		Fibroblast::from_dir_with_context(path, context)
	}

	/// Decode the Fibroblast from the given path with the given context. The context is
	/// used to evaluate variables in strings and expressions.
	///
	/// # Errors
	///
	/// If any error occurs whatsoever. See [`ClgnDecodingError`] for possible causes.
	pub fn from_dir_with_context(
		path: impl AsRef<Path>,
		context: DecodingContext,
	) -> ClgnDecodingResult<Self> {
		let path = path.as_ref();

		let root = RootTag::new_from_dir_with_jsonnet(path)
			.or_else(|_| RootTag::new_from_dir_with_pure_json(path))?;

		Ok(Self { root, context })
	}
}
