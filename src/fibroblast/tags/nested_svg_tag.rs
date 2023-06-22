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
use once_cell::sync::Lazy;
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
pub struct NestedSvgTag {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(flatten)]
	attrs: DeXmlAttrs,
}

impl HasVars for NestedSvgTag {
	fn vars(&self) -> &TagVariables {
		&*EMPTY_VARS
	}
}

impl<'a> AsSvgElement<'a> for NestedSvgTag {
	fn tag_name(&self) -> &str {
		"g"
	}

	fn attrs<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>> {
		Ok(context.sub_vars_into_attrs(self.attrs.as_ref().iter())?)
	}

	fn children<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>> {
		let svg_path = self.svg_path(context)?;

		let context = context.clone();
		let abs_svg_path = crate::utils::paths::pathsep_aware_join(&*context.get_root(), svg_path)?;

		let text = std::fs::read_to_string(&abs_svg_path)
			.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
		let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();

		// Note: will be tough to remove this seemingly needless allocation without an
		// enum wrapper
		Ok(Cow::Owned(vec![AnyChildTag::Text(TextTag::new(
			text, true,
		))]))
	}
}

impl NestedSvgTag {
	fn svg_path<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'b, str>> {
		Ok(context.eval_exprs_in_str(&self.svg_path)?)
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

impl_trivially_validatable!(NestedSvgTag);
