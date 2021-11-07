use super::AnyChildTag;
use super::{TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub(super) struct CommonTagFields<'a> {
	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<AnyChildTag<'a>>>,

	#[serde(default)]
	text: Option<String>,

	#[serde(default)]
	should_escape_text: Option<bool>,
}

impl<'a> CommonTagFields<'a> {
	pub(crate) fn base_vars(&self) -> &TagVariables {
		match &self.vars {
			None => &EMPTY_VARS,
			Some(vars) => vars,
		}
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		}
	}

	pub(crate) fn base_children(&self) -> &[AnyChildTag<'a>] {
		match &self.children {
			None => &[],
			Some(children) => children,
		}
	}

	pub(crate) fn base_text(&self) -> &str {
		match &self.text {
			None => "",
			Some(t) => t.as_ref(),
		}
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		self.should_escape_text.unwrap_or(true)
	}
}
