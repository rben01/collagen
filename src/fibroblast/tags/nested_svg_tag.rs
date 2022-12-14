use super::any_child_tag::AnyChildTag;
use super::common_tag_fields::CommonTagFields;
use crate::fibroblast::data_types::{DecodingContext, TagVariables, XmlAttrs};
use crate::to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult};
use lazy_static::lazy_static;
use lazycell::LazyCell;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

lazy_static! {
	static ref XML_HEADER_RE: Regex = RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap();
}

#[derive(Serialize, Deserialize, Debug)]
pub struct NestedSvgTag<'a> {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,

	#[serde(skip)]
	#[serde(default)]
	_text: LazyCell<String>,
}

impl<'a> NestedSvgTag<'a> {
	pub(super) fn initialize(&self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		match self._text.borrow() {
			Some(_text) => Ok(()),
			None => {
				let context = context.clone();
				let abs_svg_path =
					crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.svg_path)?;

				let text = std::fs::read_to_string(&abs_svg_path)
					.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
				let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();

				self._text.fill(text).unwrap();

				Ok(())
			}
		}
	}

	pub(super) fn tag_name(&self) -> &str {
		"g"
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(super) fn children(&self) -> &[AnyChildTag<'a>] {
		&[]
	}

	pub(super) fn base_text(&self) -> &str {
		self._text
			.borrow()
			.expect("called `NestedSvgTag::base_text` before initializing")
	}

	pub(super) fn should_escape_text(&self) -> bool {
		false
	}
}
