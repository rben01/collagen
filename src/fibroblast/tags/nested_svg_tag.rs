use super::{any_child_tag::AnyChildTag, traits::HasVars, TagVariables, EMPTY_ATTRS, EMPTY_VARS};
use crate::{
	fibroblast::data_types::{DecodingContext, XmlAttrs},
	to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult},
};
use once_cell::sync::{Lazy, OnceCell};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

static XML_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
	RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NestedSvgTag {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(skip)]
	_text: OnceCell<String>,
}

impl HasVars for NestedSvgTag {
	fn base_vars(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&EMPTY_VARS)
	}

	fn base_vars_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

impl NestedSvgTag {
	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		self.attrs.as_ref().unwrap_or(&EMPTY_ATTRS)
	}

	fn base_children(&self) -> &[AnyChildTag<'_>] {
		&[]
	}

	pub(super) fn should_escape_text(&self) -> bool {
		false
	}
}

impl NestedSvgTag {
	pub(super) fn tag_name(&self) -> &str {
		"g"
	}

	pub(super) fn text(&self, context: &DecodingContext<'_>) -> ClgnDecodingResult<&str> {
		self._text
			.get_or_try_init(|| -> ClgnDecodingResult<String> {
				let context = context.clone();
				let abs_svg_path =
					crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.svg_path)?;

				let text = std::fs::read_to_string(&abs_svg_path)
					.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
				let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();
				Ok(text)
			})
			.map(|s| s.as_str())
	}

	pub(super) fn children(&self) -> &[AnyChildTag<'_>] {
		self.base_children()
	}
}
