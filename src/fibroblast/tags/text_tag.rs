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

impl TextTag {
	pub(crate) fn new(text: String, is_preescaped: bool) -> Self {
		Self {
			text,
			is_preescaped: Some(is_preescaped),
			vars: DeTagVariables { vars: None },
		}
	}
}

impl HasVars for TextTag {
	fn vars(&self) -> &TagVariables {
		self.vars.as_ref()
	}
}

impl HasOwnedVars for TextTag {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> AsTextNode<'a> for TextTag {
	fn raw_text<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'b, str>> {
		Ok(context.eval_exprs_in_str(&self.text)?)
	}

	fn is_preescaped(&self, _: &DecodingContext) -> ClgnDecodingResult<bool> {
		Ok(self.is_preescaped.unwrap_or(false))
	}
}

impl_trivially_validatable!(TextTag);
