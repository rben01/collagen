use super::{any_child_tag::AnyChildTag, traits::HasVars, TagVariables, EMPTY_ATTRS, EMPTY_VARS};
use crate::{
	fibroblast::data_types::{DecodingContext, XmlAttrs},
	to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult},
};
use once_cell::sync::{Lazy, OnceCell};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

static XML_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
	RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NestedSvgTag<'a> {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(skip)]
	_text: OnceCell<String>,

	#[serde(skip)]
	svg_path_reified: OnceCell<Cow<'a, str>>,
}

impl HasVars for NestedSvgTag<'_> {
	fn base_vars(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&EMPTY_VARS)
	}

	fn base_vars_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

impl<'a> NestedSvgTag<'a> {
	fn svg_path(&'a self, context: &DecodingContext) -> ClgnDecodingResult<&'a str> {
		Ok(self
			.svg_path_reified
			.get_or_try_init(|| context.eval_exprs_in_str(&self.svg_path))?
			.as_ref())
	}

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

impl<'a> NestedSvgTag<'a> {
	pub(super) fn tag_name(&self) -> &str {
		"g"
	}

	pub(super) fn text(&'a self, context: &DecodingContext) -> ClgnDecodingResult<&'a str> {
		self._text
			.get_or_try_init(|| -> ClgnDecodingResult<String> {
				let svg_path = self.svg_path(context)?;

				let context = context.clone();
				let abs_svg_path =
					crate::utils::paths::pathsep_aware_join(&*context.get_root(), svg_path)?;

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
