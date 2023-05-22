mod unvalidated;

use super::{
	common_tag_fields::CommonTagFields,
	traits::{HasCommonTagFields, HasVars},
	AnyChildTag, AttrKVValueVec, ClgnDecodingResult, DecodingContext, TagLike, TagVariables,
};
use crate::{
	dispatch_to_common_tag_fields, fibroblast::data_types::SimpleValue,
	to_svg::svg_writable::ClgnDecodingError,
};
use serde::Serialize;
use std::borrow::Cow;
pub(crate) use unvalidated::UnvalidatedRootTag;

/// The document root (`<svg>...<svg>`). A `collagen.json` file is expected to contain a
/// single object; that object is always implicitly of type `RootTag`. The set of keys
/// does not matter — even `{}` is perfectly valid (it will be turned into simply `<svg
/// xmlns="http://www.w3.org/2000/svg"></svg>`).
///
/// `RootTag` accepts only the properties in [`CommonTagFields`](crate::fibroblast::tags::CommonTagFields).
#[derive(Serialize, Debug, Clone)]
pub struct RootTag<'a> {
	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> TryFrom<UnvalidatedRootTag> for RootTag<'a> {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedRootTag) -> Result<Self, Self::Error> {
		let UnvalidatedRootTag { common_tag_fields } = value;
		let common_tag_fields = common_tag_fields.try_into()?;
		Ok(Self { common_tag_fields })
	}
}

dispatch_to_common_tag_fields!(impl HasVars for RootTag<'_>);
dispatch_to_common_tag_fields!(impl<'a> HasCommonTagFields<'a> for RootTag<'a>);

impl<'a> RootTag<'a> {
	pub(crate) fn children(&'a self) -> &[AnyChildTag<'a>] {
		self.base_children()
	}
}

impl<'a> TagLike<'a> for RootTag<'a> {
	fn tag_name(&self) -> &str {
		"svg"
	}

	fn vars(&self, _: &DecodingContext) -> ClgnDecodingResult<&TagVariables> {
		Ok(self.base_vars())
	}

	fn attrs(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
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

	fn text(&'a self, _: &DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
		Ok(Cow::Borrowed(self.base_text()))
	}

	fn should_escape_text(&self) -> bool {
		self.common_tag_fields.should_escape_text()
	}
}
