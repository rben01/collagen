use super::{
	element::{AsTextNode, HasOwnedVars, HasVars},
	DeTagVariables, DecodingContext, TagVariables,
};
use crate::{impl_trivially_validatable, ClgnDecodingResult};
use quick_xml::events::BytesText;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextTag {
	text: String,

	#[serde(default, skip_serializing_if = "Option::is_none")]
	is_preescaped: Option<bool>,

	#[serde(flatten)]
	vars: DeTagVariables,
}

impl HasVars for TextTag {
	fn vars(&self) -> &TagVariables {
		self.vars.as_ref()
	}
}

impl HasOwnedVars for TextTag {
	fn vars_mut(&self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> AsTextNode<'a> for TextTag {
	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Cow<'a, str>> {
		Ok(context.eval_exprs_in_str(&self.text)?)
	}

	fn is_preescaped(&self, context: &DecodingContext) -> ClgnDecodingResult<bool> {
		Ok(self.is_preescaped.unwrap_or(false))
	}
}

impl TextTag {
	fn text(&self) -> BytesText {
		if self.should_escape_text() {
			BytesText::new(&self.text)
		} else {
			BytesText::from_escaped(&self.text)
		}
	}

	fn should_escape_text(&self) -> bool {
		let is_preescaped = self.is_preescaped.unwrap_or(false);
		!is_preescaped
	}
}

impl_trivially_validatable!(TextTag);
