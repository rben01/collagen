use super::{
	common_tag_fields::CommonTagFields, AnyChildTag, AttrKVValueVec, ClgnDecodingResult,
	DecodingContext, TagVariables, XmlAttrs,
};
use crate::fibroblast::data_types::SimpleValue;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct RootTag<'a> {
	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> RootTag<'a> {
	pub(crate) fn tag_name(&self) -> &str {
		"svg"
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(super) fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	pub(super) fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(crate) fn vars(&self, _: &DecodingContext) -> &TagVariables {
		self.base_vars()
	}

	pub(crate) fn attrs(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let base_attrs = self.base_attrs();
		let mut new_attrs = context.sub_vars_into_attrs(
			base_attrs
				.0
				.iter()
				.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
		)?;

		if !base_attrs.0.contains_key("xmlns") {
			new_attrs.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(new_attrs)
	}

	pub(crate) fn text(&'a self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
		Ok(context.sub_vars_into_str(self.base_text())?)
	}

	pub(crate) fn children(&self) -> &[AnyChildTag<'a>] {
		self.base_children()
	}
}
