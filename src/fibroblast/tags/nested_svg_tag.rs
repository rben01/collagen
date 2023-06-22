use super::{
	any_child_tag::AnyChildTag,
	element::{AsSvgElement, HasVars},
	text_tag::TextTag,
	DeTagVariables, DeXmlAttrs, TagVariables, EMPTY_VARS,
};
use crate::{
	fibroblast::data_types::{DecodingContext, XmlAttrsBorrowed},
	impl_trivially_validatable,
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
#[serde(deny_unknown_fields)]
pub struct NestedSvgTag<'a> {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(skip)]
	svg_path_reified: OnceCell<Cow<'a, str>>,
}

impl HasVars for NestedSvgTag<'_> {
	fn vars(&self) -> &TagVariables {
		&*EMPTY_VARS
	}
}

impl<'a> AsSvgElement<'a> for NestedSvgTag<'a> {
	fn tag_name(&self) -> &'static str {
		"g"
	}

	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<XmlAttrsBorrowed<'a>> {
		Ok(context.sub_vars_into_attrs(self.attrs.as_ref().0)?)
	}

	fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, [AnyChildTag<'a>]>> {
		let svg_path = self.svg_path(context)?;

		let context = context.clone();
		let abs_svg_path = crate::utils::paths::pathsep_aware_join(&*context.get_root(), svg_path)?;

		let text = std::fs::read_to_string(&abs_svg_path)
			.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
		let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();

		Ok(Cow::Borrowed(&[AnyChildTag::Text(TextTag {
			text,
			is_preescaped: Some(true),
			vars: DeTagVariables { vars: None },
		})]))
	}
}

impl<'a> NestedSvgTag<'a> {
	fn svg_path(&'a self, context: &DecodingContext) -> ClgnDecodingResult<&'a str> {
		Ok(self
			.svg_path_reified
			.get_or_try_init(|| context.eval_exprs_in_str(&self.svg_path))?
			.as_ref())
	}
}

// impl<'a> NestedSvgTag<'a> {
// 	pub(super) fn tag_name(&self) -> &str {
// 		"g"
// 	}

// 	pub(super) fn text(&'a self, context: &DecodingContext) -> ClgnDecodingResult<&'a str> {
// 		self._text
// 			.get_or_try_init(|| -> ClgnDecodingResult<String> {
// 				let svg_path = self.svg_path(context)?;

// 				let context = context.clone();
// 				let abs_svg_path =
// 					crate::utils::paths::pathsep_aware_join(&*context.get_root(), svg_path)?;

// 				let text = std::fs::read_to_string(&abs_svg_path)
// 					.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
// 				let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();
// 				Ok(text)
// 			})
// 			.map(|s| s.as_str())
// 	}

// 	pub(super) fn children(&self) -> &[AnyChildTag<'_>] {
// 		self.base_children()
// 	}
// }

impl_trivially_validatable!(NestedSvgTag<'_>);
