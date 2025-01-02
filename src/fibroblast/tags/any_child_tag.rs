use super::{
	container_tag::{ContainerTag, UnvalidatedContainerTag},
	font_tag::{FontTag, UnvalidatedFontTag},
	generic_tag::{GenericTag, UnvalidatedGenericTag},
	image_tag::{ImageTag, UnvalidatedImageTag},
	nested_svg_tag::{NestedSvgTag, UnvalidatedNestedSvgTag},
	text_tag::{TextTag, UnvalidatedTextTag},
	ClgnDecodingResult, Extras,
};
use crate::{
	fibroblast::{data_types::DecodingContext, tags::validation::Validatable},
	from_json::decoding_error::InvalidSchemaError,
	to_svg::svg_writable::SvgWritable,
};
use serde::{Deserialize, Serialize};
use strum_macros::{AsRefStr, EnumDiscriminants, EnumIter, IntoStaticStr};

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
#[derive(Serialize, Debug, Clone, EnumDiscriminants)]
#[strum_discriminants(vis(pub(crate)))]
#[strum_discriminants(derive(AsRefStr, IntoStaticStr, EnumIter))]
#[serde(untagged)]
pub enum AnyChildTag {
	Generic(GenericTag),
	Image(ImageTag),
	Container(ContainerTag),
	NestedSvg(NestedSvgTag),
	Font(FontTag),
	Text(TextTag),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum UnvalidatedAnyChildTag {
	Generic(UnvalidatedGenericTag),
	Image(UnvalidatedImageTag),
	Container(UnvalidatedContainerTag),
	NestedSvg(UnvalidatedNestedSvgTag),
	Font(UnvalidatedFontTag),
	Text(UnvalidatedTextTag),
	Err(Extras),
}

impl Validatable for UnvalidatedAnyChildTag {
	type Validated = AnyChildTag;

	fn validated(self) -> ClgnDecodingResult<Self::Validated>
	where
		Self: Sized,
	{
		Ok(match self {
			UnvalidatedAnyChildTag::Generic(t) => AnyChildTag::Generic(t.validated()?),
			UnvalidatedAnyChildTag::Image(t) => AnyChildTag::Image(t.validated()?),
			UnvalidatedAnyChildTag::Container(t) => AnyChildTag::Container(t.validated()?),
			UnvalidatedAnyChildTag::NestedSvg(t) => AnyChildTag::NestedSvg(t.validated()?),
			UnvalidatedAnyChildTag::Font(t) => AnyChildTag::Font(t.validated()?),
			UnvalidatedAnyChildTag::Text(t) => AnyChildTag::Text(t.validated()?),
			UnvalidatedAnyChildTag::Err(o) => {
				return Err(InvalidSchemaError::InvalidObject(o).into())
			}
		})
	}
}

impl SvgWritable for AnyChildTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		use AnyChildTag::*;
		match self {
			Generic(t) => t.to_svg(writer, context)?,
			Image(t) => t.to_svg(writer, context)?,
			Container(t) => t.to_svg(writer, context)?,
			NestedSvg(t) => t.to_svg(writer, context)?,
			Font(t) => t.to_svg(writer, context)?,
			Text(t) => t.to_svg(writer, context)?,
		};
		Ok(())
	}
}
