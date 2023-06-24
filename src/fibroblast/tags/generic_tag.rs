use super::{
	element::HasOwnedVars, DeChildTags, DeTagVariables, DeXmlAttrs, DecodingContext, TagVariables,
};
use crate::{
	impl_validatable_via_children,
	to_svg::svg_writable::{write_tag, SvgWritable},
	ClgnDecodingResult,
};
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenericTag<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(flatten)]
	vars: DeTagVariables,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten)]
	children: DeChildTags<'a>,
}

impl HasOwnedVars for GenericTag<'_> {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> SvgWritable<'a> for GenericTag<'a> {
	fn to_svg(
		&self,
		context: &DecodingContext<'a>,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		context.with_new_vars(self.vars.as_ref(), || {
			write_tag(
				writer,
				&self.tag_name,
				|elem| {
					context.write_attrs_into(self.attrs.as_ref().iter(), elem)?;
					Ok(())
				},
				|writer| {
					for child in self.children.as_ref() {
						child.to_svg(context, writer)?;
					}
					Ok(())
				},
			)?;
			Ok(())
		})
	}
}

impl_validatable_via_children!(GenericTag<'_>);
