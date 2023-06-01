use super::{
	container_tag::ContainerTag, font_tag::FontTag, foreach_tag::ForeachTag, if_tag::IfTag,
	image_tag::ImageTag, nested_svg_tag::NestedSvgTag, other_tag::OtherTag, AttrKVValueVec,
	ClgnDecodingResult, ErrorTag, TagLike, TagVariables,
};
use crate::{
	fibroblast::{
		data_types::DecodingContext,
		tags::{
			error_tag::Validatable,
			traits::{HasCommonTagFields, HasVars},
			ErrorTagReason,
		},
	},
	to_svg::svg_writable::ClgnDecodingError,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
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
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum AnyChildTag<'a> {
	Image(ImageTag<'a>),
	Container(ContainerTag<'a>),
	NestedSvg(NestedSvgTag<'a>),
	Foreach(ForeachTag<'a>),
	If(IfTag<'a>),
	Font(FontTag),
	Other(OtherTag<'a>),
	Error(ErrorTag),
}

impl<'a> AnyChildTag<'a> {
	// The "right" way to do this, of course, is to have two separate enums,
	// UnvalidatedAnyChildTag and AnyChildTag, which have all the same variants except
	// for the extra Error(ErrorTag) in UnvalidatedChildTag. And of course then we'd need
	// UnvalidatedCommonTagFields and an Unvalidated_ version of every kind of tag. And
	// then this function would consume a UnvalidatedAnyChildTag and return a
	// ClgnDecodingResult<AnyChildTag>, and the compiler would ensure we had elimited the
	// Error case (because it wouldn't exist on AnyChildTag). But all that duplication!
	// Not going to happen.
	pub(crate) fn validate(self) -> ClgnDecodingResult<Self> {
		use AnyChildTag::*;
		Ok(match self {
			Image(t) => Image(t.validate()?),
			Container(t) => Container(t.validate()?),
			NestedSvg(t) => NestedSvg(t.validate()?),
			Foreach(t) => Foreach(t.validate()?),
			If(t) => If(t.validate()?),
			Font(t) => Font(t.validate()?),
			Other(t) => Other(t.validate()?),

			Error(error_tag) => {
				let err = match error_tag.json {
					JsonValue::Object(o) => ErrorTagReason::InvalidObject(o),
					j => ErrorTagReason::InvalidType(j),
				};

				return Err(ClgnDecodingError::InvalidSchema(err));
			}
		})
	}
}

impl<'a> AnyChildTag<'a> {
	pub(crate) fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a [AnyChildTag]> {
		use AnyChildTag::*;
		Ok(match self {
			Container(t) => t.children(context)?,
			NestedSvg(t) => t.children(),
			Image(t) => t.base_children(),
			Foreach(t) => t.children(context)?,
			If(t) => t.children(context)?,
			Other(t) => t.base_children(),
			Font(t) => t.base_children(),
			Error(_) => unreachable!(),
		})
	}
}

impl<'a> TagLike<'a> for AnyChildTag<'a> {
	fn tag_name(&self) -> Option<&str> {
		use AnyChildTag::*;
		match &self {
			Container(t) => Some(t.tag_name()),
			NestedSvg(t) => Some(t.tag_name()),
			Image(t) => Some(t.tag_name()),
			Foreach(t) => t.tag_name(),
			If(t) => t.tag_name(),
			Other(t) => Some(t.tag_name()),
			Font(t) => Some(t.tag_name()),
			Error(_) => unreachable!(),
		}
	}

	fn vars(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<&TagVariables> {
		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.vars(context)?,
			NestedSvg(t) => t.base_vars(),
			Image(t) => t.base_vars(),
			Foreach(t) => t.base_vars(),
			If(t) => t.base_vars(),
			Other(t) => t.base_vars(),
			Font(t) => t.base_vars(),
			Error(_) => unreachable!(),
		})
	}

	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		use AnyChildTag::*;
		let mut attrs = match &self {
			Container(t) => context.sub_vars_into_attrs(t.attrs(context)?),
			NestedSvg(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			Image(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			Foreach(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			If(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			Other(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			Font(t) => context.sub_vars_into_attrs(t.base_attrs().iter()),
			Error(_) => unreachable!(),
		}?;

		// If more cases arise, convert this to a match
		if let AnyChildTag::Image(t) = self {
			if t.kind(context)?.as_ref() != "svg" {
				let (k, v) = t.get_image_attr_pair(context)?;
				attrs.push((k, Cow::Owned(v)));
			}
		}

		Ok(attrs)
	}

	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Cow<str>> {
		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.text(context)?,
			NestedSvg(t) => t.text(context)?.into(),
			Image(t) => context.eval_exprs_in_str(t.base_text())?,
			Foreach(t) => t.base_text().into(),
			If(t) => t.base_text().into(),
			Other(t) => context.eval_exprs_in_str(t.base_text())?,
			Font(t) => t.font_embed_text(context)?.into(),
			Error(_) => unreachable!(),
		})
	}

	fn should_escape_text(&self) -> bool {
		use AnyChildTag::*;
		match &self {
			Container(t) => t.should_escape_text(),
			NestedSvg(t) => t.should_escape_text(),
			Image(t) => t.should_escape_text(),
			Foreach(t) => t.should_escape_text(),
			If(t) => t.should_escape_text(),
			Other(t) => t.should_escape_text(),
			Font(t) => t.should_escape_text(),
			Error(_) => unreachable!(),
		}
	}
}
