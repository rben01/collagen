use super::common_tag_fields::CommonTagFields;
use crate::{
	dispatch_to_common_tag_fields,
	fibroblast::data_types::{DecodingContext, SimpleValue},
	to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult},
	utils::b64_encode,
};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, path::Path};

/// A tag for handling images on disk. Collagen handles images specially, so we need a
/// separate type for their tags. `ImageTag`s look more or less like the following:
///
/// ```json
/// { "image_path": "path/to/image" }
/// ```
///
/// The image at `image_path` will be base64 encoded and embedded in the resulting
/// `<image>` tag, resulting in an XML tag like the following:
///
/// ```xml
/// <image href="data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."></image>
/// ```
///
/// The same thing could be achieved with a generic "Other" tag:
///
/// ```json
/// {
///   "tag": "image",
///   "attrs": {
///     "href": "data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."
///   }
/// }
/// ```
///
/// But this is tedious and error prone. That's why `ImageTag` exists.
///
/// # Properties:
///
/// - `image_path`
///   - Type: string
///   - Required: Yes.
///   - Description: Path to the image that will be embedded in this tag, relative to
///     the skeleton. For instance, if folder `my_skeleton`'s `collagen.json` has a `{
///     "image_path": "path/to/image" }`, then the file `my_skeleton/path/to/image` must
///     exist.
/// - `kind`
///   - Type: string
///   - Required: No.
///   - Description: The "kind" of the image, e.g., "jpeg", "png", etc; usually
///     synonymous with file extension. If omitted, will be inferred from the file
///     extension of `image_path`. (An error will be raised if this inference is not
///     possible, for instance if the image file lacks )
/// - Other: `ImageTag` accepts all properties in [`CommonTagFields`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageTag<'a> {
	/// The path to the image relative to the folder root
	image_path: String,

	/// The image "kind" (usually synonymous with file extension). If `None`, will be
	/// set to the file extension of `image_path`
	#[serde(skip_serializing_if = "Option::is_none")]
	kind: Option<String>,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,

	#[serde(skip)]
	image_path_reified: OnceCell<Cow<'a, str>>,
}

dispatch_to_common_tag_fields!(impl HasVars for ImageTag<'_>);
dispatch_to_common_tag_fields!(impl<'a> HasCommonTagFields<'a> for ImageTag<'a>);

impl<'a> ImageTag<'a> {
	fn image_path(&'a self, context: &DecodingContext) -> ClgnDecodingResult<&'a str> {
		Ok(self
			.image_path_reified
			.get_or_try_init(|| context.eval_exprs_in_str(&self.image_path))?
			.as_ref())
	}

	/// The kind of the image (e.g., `"jpg"`, `"png"`). This corresponds to the `{TYPE}`
	/// in the data URI `data:image/{TYPE};base64,...`. If `self.kind.is_none()`, the
	/// `kind` will be inferred from the (lowercased) file extension of `image_path`.
	pub(crate) fn kind(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, str>> {
		Ok(match &self.kind {
			Some(kind) => Cow::Borrowed(kind),
			None => {
				let image_path = self.image_path(context)?;
				let path = Path::new(&image_path);
				let kind = path
					.extension()
					.and_then(|extn| extn.to_str())
					.map(|s| Cow::Owned(s.to_ascii_lowercase()))
					.ok_or_else(|| ClgnDecodingError::Image {
						msg: format!(
							r#"Could not deduce the extension from {:?}, and no "kind" was given"#,
							self.image_path
						),
					})?;
				kind
			}
		})
	}

	/// Get the key-value pair (as a tuple) that makes the image actually work! (E.g.,
	/// the tuple `("href", "data:image/jpeg;base64,...")`)
	pub(super) fn get_image_attr_pair(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<(&'a str, SimpleValue)> {
		let key = "href";
		let kind = self.kind(context)?;

		// I'd like to find the "right" way to reduce memory usage here. We're reading a
		// file into memory and then storing its b64 string also in memory. That's
		// O(2*n). Ideally none of this would reside in memory, and we'd stream directly
		// to the output SVG. An intermediate step would be to stream the file into the
		// b64 encoder, getting memory usage down to O(1*n).

		let image_path = context.eval_exprs_in_str(&self.image_path)?;
		let abs_image_path =
			crate::utils::paths::pathsep_aware_join(&*context.get_root(), image_path)?;

		let b64_string = b64_encode(
			std::fs::read(abs_image_path.as_path())
				.map_err(|e| ClgnDecodingError::Io(e, abs_image_path))?,
		);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		Ok((key, SimpleValue::Text(src_str)))
	}

	pub(super) fn tag_name(&self) -> &str {
		"image"
	}
}
