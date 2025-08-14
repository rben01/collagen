use super::{
	any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeChildTags, DeXmlAttrs,
	Extras, UnvalidatedDeChildTags,
};
use crate::{
	fibroblast::data_types::DecodingContext,
	from_json::decoding_error::InvalidSchemaErrorList,
	to_svg::svg_writable::{
		prepare_and_write_tag, ClgnDecodingError, ClgnDecodingResult, SvgWritable,
	},
	utils::b64_encode_streaming,
};
use compact_str::CompactString;
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
#[derive(Debug, Clone, Serialize)]
pub struct ImageTag {
	#[serde(flatten)]
	inner: Inner,

	#[serde(flatten)]
	children: DeChildTags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	/// The path to the image relative to the folder root
	image_path: CompactString,

	/// The image "kind" (usually synonymous with file extension). If `None`, will be
	/// set to the file extension of `image_path`
	#[serde(skip_serializing_if = "Option::is_none")]
	kind: Option<CompactString>,

	attrs: DeXmlAttrs,
}

impl ImageTag {
	/// The kind of the image (e.g., `"jpg"`, `"png"`). This corresponds to the `{TYPE}`
	/// in the data URI `data:image/{TYPE};base64,...`. If `self.kind.is_none()`, the
	/// `kind` will be inferred from the (lowercased) file extension of `image_path`.
	pub(crate) fn kind(&self) -> ClgnDecodingResult<Cow<str>> {
		let Inner {
			image_path,
			kind,
			attrs: _,
		} = &self.inner;

		Ok(if let Some(kind) = kind {
			Cow::Borrowed(kind)
		} else {
			let path = Path::new(image_path);
			path.extension()
				.and_then(|extn| extn.to_str())
				.map(|s| Cow::Owned(s.to_ascii_lowercase()))
				.ok_or_else(|| ClgnDecodingError::Image {
					msg: format!(
						r#"Could not deduce the extension from {image_path:?}, and no "kind" was given"#,
					),
				})?
		})
	}

	/// Get the key-value pair (as a tuple) that makes the image actually work. (E.g.,
	/// the tuple `("href", "data:image/jpeg;base64,...")`)
	pub(super) fn get_image_attr_pair(
		&self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<(&'static str, String)> {
		let key = "href";
		let kind = self.kind()?;

		// Optimized: Use streaming base64 encoding to reduce peak memory usage
		// by avoiding double allocation (file bytes + base64 string)
		let (img_bytes, _) = context.fetch_resource(&self.inner.image_path)?;

		// Stream base64 encode directly to a buffer to reduce memory usage
		let data_uri_prefix = format!("data:image/{kind};base64,");
		let mut src_buffer = Vec::with_capacity(data_uri_prefix.len() + (img_bytes.len() * 4 / 3) + 4);
		
		// Write the prefix
		src_buffer.extend_from_slice(data_uri_prefix.as_bytes());
		
		// Stream base64 encode the image data directly to the buffer
		b64_encode_streaming(&img_bytes, &mut src_buffer)
			.map_err(|e| ClgnDecodingError::Image { msg: format!("Failed to encode image to base64: {e:?}") })?;
		
		let src_str = String::from_utf8(src_buffer)
			.map_err(|_| ClgnDecodingError::Image { msg: "Failed to create UTF-8 string from base64 data".to_string() })?;

		Ok((key, src_str))
	}

	/// Write the image data URI directly to a writer using streaming base64 encoding
	/// to reduce memory usage. Returns the attribute key.
	pub(super) fn write_image_attr_streaming<W: std::io::Write>(
		&self,
		writer: &mut W,
		context: &DecodingContext,
	) -> ClgnDecodingResult<&'static str> {
		let key = "href";
		let kind = self.kind()?;

		// Write the data URI prefix
		write!(writer, "data:image/{kind};base64,")
			.map_err(|e| ClgnDecodingError::Image { msg: format!("Failed to write image prefix: {e:?}") })?;

		// Stream the base64 encoded image data directly to the writer
		let (img_bytes, _) = context.fetch_resource(&self.inner.image_path)?;
		b64_encode_streaming(&img_bytes, writer)
			.map_err(|e| ClgnDecodingError::Image { msg: format!("Failed to stream base64 data: {e:?}") })?;

		Ok(key)
	}
}

impl SvgWritable for ImageTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		let Self {
			inner: Inner {
				attrs,
				image_path: _,
				kind: _,
			},
			children,
		} = self;

		let (img_k, img_v) = self.get_image_attr_pair(context)?;

		prepare_and_write_tag(
			writer,
			"image",
			|elem| {
				attrs.as_ref().write_into(elem);
				elem.push_attribute((img_k, img_v.as_ref()));
			},
			|writer| {
				for child in children.as_ref() {
					child.to_svg(writer, context)?;
				}
				Ok(())
			},
		)?;

		Ok(())
	}
}

#[derive(Debug, Deserialize)]
pub(crate) struct UnvalidatedImageTag {
	#[serde(flatten)]
	inner: Inner,

	children: UnvalidatedDeChildTags,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedImageTag {
	type Validated = ImageTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner {
				image_path,
				kind,
				attrs,
			},
			children,
			extras,
		} = self;

		if let Err(err) = extras.ensure_empty(AnyChildTagDiscriminants::Image.name()) {
			errors.push(err);
		}

		Ok(ImageTag {
			inner: Inner {
				image_path,
				kind,
				attrs,
			},
			children: children.into_validated(errors)?,
		})
	}
}
