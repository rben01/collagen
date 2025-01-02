use super::{
	any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeChildTags, DeXmlAttrs,
	DecodingContext, Extras, UnvalidatedDeChildTags,
};
use crate::{
	to_svg::svg_writable::{write_tag, SvgWritable},
	ClgnDecodingResult,
};
use compact_str::CompactString;
use serde::{Deserialize, Serialize};

/// `GenericTag` is a generic tag that doesn't need to be handled specially, such as
/// `<rect>`, which needs no special. This is different from, say, `<image>`, which
/// needs some extra work and thus requires the specialized `Imagetag`.
///
/// `GenericTag`'s tag name — the thing between the angle brackets (`rect` in `<rect>`)
/// — is determined by the `tag_name` field.
///
/// # Properties
///
/// - `tag_name`
///   - Type: string
///   - Required: Yes.
///   - Description: The tag's name. For instance, to make a `<rect>` tag, use
///     `"tag_name": "rect"`.
#[derive(Debug, Clone, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GenericTag {
	#[serde(rename = "tag")]
	tag_name: CompactString,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten)]
	children: DeChildTags,
}

impl SvgWritable for GenericTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		write_tag(writer, &self.tag_name, self.attrs.as_ref(), |writer| {
			for child in self.children.as_ref() {
				child.to_svg(writer, context)?;
			}
			Ok(())
		})
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UnvalidatedGenericTag {
	#[serde(rename = "tag")]
	tag_name: CompactString,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten)]
	children: UnvalidatedDeChildTags,

	#[serde(flatten, default)]
	extras: Extras,
}

impl Validatable for UnvalidatedGenericTag {
	type Validated = GenericTag;

	fn validated(self) -> ClgnDecodingResult<Self::Validated> {
		let Self {
			tag_name,
			attrs,
			children,
			extras,
		} = self;

		extras.ensure_empty(AnyChildTagDiscriminants::Generic.name())?;

		Ok(GenericTag {
			tag_name,
			attrs,
			children: children.validated()?,
		})
	}
}
