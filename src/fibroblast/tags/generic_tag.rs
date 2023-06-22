use std::borrow::Cow;

use super::{
	element::{AsSvgElement, HasOwnedVars, HasVars},
	AnyChildTag, DeChildTags, DeTagVariables, DeXmlAttrs, DecodingContext, TagVariables,
};
use crate::{
	fibroblast::data_types::XmlAttrsBorrowed, impl_validatable_via_children, ClgnDecodingResult,
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

impl HasVars for GenericTag<'_> {
	fn vars(&self) -> &TagVariables {
		self.vars.as_ref()
	}
}

impl HasOwnedVars for GenericTag<'_> {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> AsSvgElement<'a> for GenericTag<'a> {
	fn tag_name(&self) -> &str {
		self.tag_name.as_ref()
	}

	fn attrs<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>> {
		context.sub_vars_into_attrs(self.attrs.as_ref().iter())
	}

	fn children<'b>(
		&'b self,
		_: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>> {
		Ok(Cow::Borrowed(self.children.as_ref()))
	}
}

impl_validatable_via_children!(GenericTag<'_>);
