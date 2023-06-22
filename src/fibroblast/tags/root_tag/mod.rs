use super::{
	element::{AsSvgElement, HasVars},
	error_tag::Validatable,
	AnyChildTag, ClgnDecodingResult, DeChildTags, DeTagVariables, DeXmlAttrs, DecodingContext,
	TagVariables,
};
use crate::fibroblast::data_types::{SimpleValue, XmlAttrsBorrowed};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// The document root (`<svg>...<svg>`). A `collagen.json` file is expected to contain a
/// single object; that object is always implicitly of type `RootTag`. The set of keys
/// does not matter — even `{}` is perfectly valid (it will be turned into simply `<svg
/// xmlns="http://www.w3.org/2000/svg"></svg>`).
///
/// `RootTag` accepts only the properties in [`CommonTagFields`](crate::fibroblast::tags::CommonTagFields).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootTag<'a> {
	#[serde(flatten)]
	pub(crate) vars: DeTagVariables,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten)]
	children: DeChildTags<'a>,
}

impl HasVars for RootTag<'_> {
	fn vars(&self) -> &TagVariables {
		self.vars.as_ref()
	}
}

impl<'a> AsSvgElement<'a> for RootTag<'a> {
	fn tag_name(&self) -> &'static str {
		"svg"
	}

	fn attrs<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>> {
		let mut attrs = context.sub_vars_into_attrs(self.attrs.as_ref().iter())?;

		if !attrs.0.iter().any(|(k, _)| *k == "xmlns") {
			attrs.0.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(attrs)
	}

	fn children<'b>(
		&'b self,
		_: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>> {
		Ok(Cow::Borrowed(self.children.as_ref()))
	}
}

impl<'a> RootTag<'a> {
	pub(crate) fn validate(mut self) -> ClgnDecodingResult<Self> {
		let children = self.children.children.take();
		let Some(children) = children else {
			return Ok(self);
		};
		self.children = DeChildTags {
			children: Some(
				children
					.into_iter()
					.map(|child| child.validate())
					.collect::<ClgnDecodingResult<Vec<_>>>()?,
			),
		};

		Ok(self)
	}
}
