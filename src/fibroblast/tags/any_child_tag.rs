use super::{
	container_tag::ContainerTag, font_tag::FontTag, image_tag::ImageTag, other_tag::OtherTag,
};
use super::{AttrKVValueVec, ClgnDecodingResult, TagLike, TagVariables};
use crate::fibroblast::data_types::DecodingContext;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// A wrapper for any child tag
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum AnyChildTag<'a> {
	Container(ContainerTag<'a>),
	Image(ImageTag<'a>),
	Other(OtherTag<'a>),
	Font(FontTag),
}

impl<'a> AnyChildTag<'a> {
	// This seems dumb. Any way to dedupe this?

	fn initialize(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		let ok = Ok(());
		match &self {
			AnyChildTag::Container(t) => t.initialize(context).and(ok),
			_ => ok,
		}
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
