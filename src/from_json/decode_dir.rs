//! Implements the decoding methods for [`Fibroblast`], which let you produce a
//! `Fibroblast` from some serialized data (e.g. a directory with the necessary manifest
//! and files)

use super::{decoding_error::ClgnDecodingResult, ClgnDecodingError};
use crate::{
	cli::{ManifestFormat, ProvidedInput},
	fibroblast::{data_types::DecodingContext, tags::root_tag::RootTag, Fibroblast},
};

impl Fibroblast {
	/// Decode the Fibroblast from the given path
	///
	/// # Errors
	///
	/// If any error occurs whatsoever. See [`ClgnDecodingError`] for possible causes.
	pub fn from_dir(
		input: ProvidedInput,
		format: Option<ManifestFormat>,
	) -> ClgnDecodingResult<Self> {
		let context = DecodingContext::new_at_root(input.folder().to_owned());

		let root = match format {
			Some(ManifestFormat::Json) => RootTag::new_from_dir_with_pure_json(input)?,
			Some(ManifestFormat::Jsonnet) => RootTag::new_from_dir_with_jsonnet(input)?,
			None => {
				match RootTag::new_from_dir_with_jsonnet(input) {
					Ok(root) => root,
					Err(ClgnDecodingError::JsonnetRead { msg, path: _ })
						if msg.ends_with("No such file or directory") =>
					{
						// continue on and try json
						RootTag::new_from_dir_with_pure_json(input)?
					}
					Err(err) => return Err(err),
				}
			}
		};

		Ok(Self { root, context })
	}
}
