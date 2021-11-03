use super::{container_tag::ContainerTag, image_tag::ImageTag, other_tag::OtherTag};
use super::{AttrKVValueVec, ClgnDecodingResult, TagVariables};
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
}

impl<'a> AnyChildTag<'a> {
	// This seems dumb. Any way to dedupe this?
	pub(crate) fn tag_name(&self) -> &str {
		use AnyChildTag::*;
		match &self {
			Container(t) => t.tag_name(),
			Image(t) => t.tag_name(),
			Other(t) => t.tag_name(),
		}
	}

	fn initialize(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		let ok = Ok(());
		match &self {
			AnyChildTag::Container(t) => t.initialize(context).and(ok),
			_ => ok,
		}
	}

	pub(crate) fn vars(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&TagVariables> {
		self.initialize(context)?;

		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.vars(),
			Image(t) => t.base_vars(),
			Other(t) => t.base_vars(),
		})
	}

	pub(crate) fn attrs(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
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
		}?;

		// If more cases arise, convert this to a match
		if let AnyChildTag::Image(t) = self {
			attrs.push(t.get_image_attr_pair(context)?);
		}

		Ok(attrs)
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
		})
	}

	pub(crate) fn text(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, str>> {
		self.initialize(context)?;

		use AnyChildTag::*;
		match &self {
			Container(t) => t.text(),
			Image(t) => Ok(context.sub_vars_into_str(t.base_text())?),
			Other(t) => Ok(context.sub_vars_into_str(t.base_text())?),
		}
	}
}
