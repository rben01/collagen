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
	pub fn new(input: &ProvidedInput, format: Option<ManifestFormat>) -> ClgnDecodingResult<Self> {
		let context = DecodingContext::from(input.clone());

		let root = match format {
			Some(format) => RootTag::new(input, format)?,
			None => {
				match RootTag::new(input, ManifestFormat::Jsonnet) {
					Ok(root) => root,
					Err(ClgnDecodingError::JsonnetRead { msg, path: _ })
						if msg.ends_with("No such file or directory") =>
					{
						// continue on and try json
						RootTag::new(input, ManifestFormat::Json)?
					}
					Err(ClgnDecodingError::MissingJsonnetFile) => {
						// continue on and try json
						RootTag::new(input, ManifestFormat::Json)?
					}
					Err(err) => return Err(err),
				}
			}
		};

		Ok(Self { root, context })
	}
}
