//! Implements the decoding methods for [`Fibroblast`], which let you produce a
//! `Fibroblast` from some serialized data (e.g. a directory with the necessary manifest
//! and files)

use super::{decoding_error::ClgnDecodingResult, ClgnDecodingError};
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

		Ok(match RootTag::new_from_dir_with_jsonnet(path) {
			Ok(root) => Self { root, context },
			Err(ClgnDecodingError::JsonnetRead { msg, path: _ })
				if msg.ends_with("No such file or directory") =>
			{
				// continue on and try json
				let root = RootTag::new_from_dir_with_pure_json(path)?;
				Self { root, context }
			}
			Err(err) => return Err(err),
		})
	}
}
