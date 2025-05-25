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
	from_json::decoding_error::{InvalidSchemaError, InvalidSchemaErrorList},
	to_svg::svg_writable::SvgWritable,
};
use serde::{Deserialize, Serialize};
use strum::{AsRefStr, EnumDiscriminants, EnumIter, IntoStaticStr};

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

#[derive(Deserialize, Debug)]
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

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		match self {
			UnvalidatedAnyChildTag::Generic(t) => {
				t.into_validated(errors).map(AnyChildTag::Generic)
			}
			UnvalidatedAnyChildTag::Image(t) => t.into_validated(errors).map(AnyChildTag::Image),
			UnvalidatedAnyChildTag::Container(t) => {
				t.into_validated(errors).map(AnyChildTag::Container)
			}
			UnvalidatedAnyChildTag::NestedSvg(t) => {
				t.into_validated(errors).map(AnyChildTag::NestedSvg)
			}
			UnvalidatedAnyChildTag::Font(t) => t.into_validated(errors).map(AnyChildTag::Font),
			UnvalidatedAnyChildTag::Text(t) => t.into_validated(errors).map(AnyChildTag::Text),
			UnvalidatedAnyChildTag::Err(o) => {
				errors.push(InvalidSchemaError::UnrecognizedObject(o));
				Err(())
			}
		}
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
