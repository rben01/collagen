use super::{
	container_tag::ContainerTag,
	element::{AsNodeGenerator, Node, Tag},
	font_tag::FontTag,
	foreach_tag::ForeachTag,
	generic_tag::GenericTag,
	if_tag::IfTag,
	image_tag::ImageTag,
	nested_svg_tag::NestedSvgTag,
	text_tag::TextTag,
	ClgnDecodingResult, ErrorTag,
};
use crate::{
	fibroblast::{
		data_types::DecodingContext,
		tags::{
			element::{AsSvgElement, AsTextNode, HasVars},
			error_tag::Validatable,
			ErrorTagReason,
		},
	},
	to_svg::svg_writable::ClgnDecodingError,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

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
	Generic(GenericTag<'a>),
	Image(ImageTag<'a>),
	Container(ContainerTag<'a>),
	NestedSvg(NestedSvgTag<'a>),
	Foreach(ForeachTag<'a>),
	If(IfTag<'a>),
	Font(FontTag),
	Text(TextTag),
	Error(ErrorTag),
}

impl Validatable for AnyChildTag<'_> {
	// The "right" way to do this, of course, is to have two separate enums,
	// UnvalidatedAnyChildTag and AnyChildTag, which have all the same variants except
	// for the extra Error(ErrorTag) in UnvalidatedChildTag. And of course then we'd need
	// UnvalidatedCommonTagFields and an Unvalidated_ version of every kind of tag. And
	// then this function would consume a UnvalidatedAnyChildTag and return a
	// ClgnDecodingResult<AnyChildTag>, and the compiler would ensure we had elimited the
	// Error case (because it wouldn't exist on AnyChildTag). But all that duplication!
	// Not going to happen.
	fn validate(self) -> ClgnDecodingResult<Self>
	where
		Self: Sized,
	{
		use AnyChildTag::*;
		Ok(match self {
			Generic(t) => Generic(t.validate()?),
			Image(t) => Image(t.validate()?),
			Container(t) => Container(t.validate()?),
			NestedSvg(t) => NestedSvg(t.validate()?),
			Foreach(t) => Foreach(t.validate()?),
			If(t) => If(t.validate()?),
			Font(t) => Font(t.validate()?),
			Text(t) => Text(t.validate()?),
			Error(t) => {
				let err = match t.json {
					JsonValue::Object(o) => ErrorTagReason::InvalidObject(o),
					j => ErrorTagReason::InvalidType(j),
				};

				return Err(ClgnDecodingError::InvalidSchema(err));
			}
		})
	}
}

impl<'a> AnyChildTag<'a> {
	fn as_tag(&self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Tag<'a>> {
		use AnyChildTag::*;

		let (vars, node) = match self {
			Generic(t) => (t.vars(), t.as_tag(context)?.into()),
			Image(t) => (t.vars(), t.as_tag(context)?.into()),
			Container(t) => (t.vars(), t.as_tag(context)?.into()),
			NestedSvg(t) => (t.vars(), t.as_tag(context)?.into()),
			Foreach(t) => (t.vars(), t.as_node_gtor(context)?.into()),
			If(t) => (t.vars(), t.as_node_gtor(context)?.into()),
			Font(t) => (t.vars(), t.as_tag(context)?.into()),
			Text(t) => (t.vars(), t.as_text_node(context)?.into()),
			Error(_) => todo!(),
		};

		Ok(Tag { vars, node })
	}
}
