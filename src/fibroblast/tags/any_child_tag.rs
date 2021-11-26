use super::{
	container_tag::ContainerTag, font_tag::FontTag, image_tag::ImageTag, other_tag::OtherTag,
};
use super::{AttrKVValueVec, ClgnDecodingResult, TagLike, TagVariables};
use crate::fibroblast::data_types::DecodingContext;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// A wrapper around child tags. During deserialization, the type of child tag to
/// deserialize an object into is determined solely from the object's set of keys.
///
/// Child tags must be one of the kinds below (corresponding to the variants of
/// `AnyChildTag`). Read an individual tag's documentation for the keys it expects.
///
/// - [`ImageTag`]: a tag representing an image file on disk
/// - [`ContainerTag`]: a tag wrapping another Collagen folder on disk, which will be
///   ingested more or less as-is into the current SVG
/// - [`FontTag`]: a tag used to include either a woff2 font file on disk or a font that
///   came bundled with the Collagen executable
/// - [`OtherTag`]: the most general option; represents any kind of SVG tag that does
///   not need any special handling as the above tags do

#[derive(Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
#[serde(untagged)]
pub enum AnyChildTag<'a> {
	Image(ImageTag<'a>),
	Container(ContainerTag<'a>),
	Font(FontTag),
	Other(OtherTag<'a>),
}

impl<'a> AnyChildTag<'a> {
	fn initialize(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		if let AnyChildTag::Container(t) = self {
			t.initialize(context)?;
		}
		Ok(())
	}

	pub(crate) fn children(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a [AnyChildTag]> {
		self.initialize(context)?;

		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.children(),
			Image(t) => t.base_children(),
			Other(t) => t.base_children(),
			Font(t) => t.base_children(),
		})
	}
}

impl<'a> TagLike<'a> for AnyChildTag<'a> {
	fn tag_name(&self) -> &str {
		use AnyChildTag::*;
		match &self {
			Container(t) => t.tag_name(),
			Image(t) => t.tag_name(),
			Other(t) => t.tag_name(),
			Font(t) => t.tag_name(),
		}
	}

	fn vars(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<&TagVariables> {
		self.initialize(context)?;

		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.vars()?,
			Image(t) => t.base_vars(),
			Other(t) => t.base_vars(),
			Font(t) => t.base_vars(),
		})
	}

	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		self.initialize(context)?;

		use AnyChildTag::*;
		let mut attrs = match &self {
			Container(t) => context.sub_vars_into_attrs(t.attrs()?),
			Image(t) => context.sub_vars_into_attrs(
				t.base_attrs()
					.0
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
			),
			Other(t) => context.sub_vars_into_attrs(
				t.base_attrs()
					.0
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
			),
			Font(t) => context.sub_vars_into_attrs(
				t.base_attrs()
					.0
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
			),
		}?;

		// If more cases arise, convert this to a match
		if let AnyChildTag::Image(t) = self {
			let (k, v) = t.get_image_attr_pair(context)?;
			attrs.push((k, Cow::Owned(v)));
		}

		Ok(attrs)
	}

	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Cow<'a, str>> {
		self.initialize(context)?;

		use AnyChildTag::*;
		match &self {
			Container(t) => t.text(),
			Image(t) => Ok(context.sub_vars_into_str(t.base_text())?),
			Other(t) => Ok(context.sub_vars_into_str(t.base_text())?),
			Font(t) => Ok(Cow::Owned(t.font_embed_text(context)?)),
		}
	}

	fn should_escape_text(&self) -> bool {
		use AnyChildTag::*;
		match &self {
			Container(t) => t.should_escape_text(),
			Image(t) => t.should_escape_text(),
			Other(t) => t.should_escape_text(),
			Font(t) => t.should_escape_text(),
		}
	}
}
