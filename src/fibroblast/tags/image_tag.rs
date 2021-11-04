use super::any_child_tag::AnyChildTag;
use super::common_tag_fields::CommonTagFields;
use crate::fibroblast::data_types::{DecodingContext, SimpleValue, TagVariables, XmlAttrs};
use crate::to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult};
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, path::PathBuf};

/// A tag for handling images. We handle images specially (that's the whole point), so
/// we need a separate type for their tags.
#[derive(Serialize, Deserialize, Debug)]
pub struct ImageTag<'a> {
	/// The path to the image relative to the folder root
	image_path: String,

	/// The image "kind" (usually synonymous with file extension). If `None`, will be
	/// set to the file extension of `image_path`
	#[serde(default)]
	kind: Option<String>,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> ImageTag<'a> {
	/// The kind of the image (e.g., `"jpg"`, `"png"`). If `self.kind.is_none()`, the
	/// `kind` will be inferred from the file extension of `image_path`. A file
	/// extension's case is ignored.
	pub(crate) fn kind(&'a self) -> Option<Cow<'a, str>> {
		match &self.kind {
			Some(kind) => Some(Cow::Borrowed(kind)),
			None => {
				let path = PathBuf::from(&self.image_path);
				let extn = path.extension()?.to_str()?.to_ascii_lowercase();
				Some(Cow::Owned(extn))
			}
		}
	}

	/// Get the key-value pair (as a tuple) that makes the image actually work! (E.g.,
	/// the tuple `("href", "data:image/jpeg;base64,...")`)
	pub(super) fn get_image_attr_pair(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<(&'a str, SimpleValue)> {
		let key = "href";

		let kind = match self.kind() {
			Some(kind) => kind,
			None => {
				return Err(ClgnDecodingError::Image(format!(
					r#"Could not deduce the extension from {:?}, and no "kind" was given"#,
					self.image_path
				)));
			}
		};

		// I'd like to find the "right" way to reduce memory usage here. We're reading a
		// file into memory and then storing its b64 string also in memory. That's
		// O(2*n). Ideally none of this would reside in memory, and we'd stream directly
		// to the output SVG. An intermediate step would be to stream the file into the
		// b64 encoder, getting memory usage down to O(1*n).
		let abs_image_path = context.get_root().join(&self.image_path);
		let b64_string = base64::encode(std::fs::read(abs_image_path)?);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		Ok((key, SimpleValue::Text(src_str)))
	}

	pub(super) fn tag_name(&self) -> &str {
		"image"
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(super) fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	pub(super) fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(super) fn should_encode_text(&self) -> bool {
		self.common_tag_fields.should_encode_text()
	}
}
