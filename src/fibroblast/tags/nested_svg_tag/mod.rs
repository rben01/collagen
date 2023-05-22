mod unvalidated;

use super::{
	any_child_tag::AnyChildTag, common_tag_fields::CommonTagFields, traits::HasCommonTagFields,
};
use crate::{
	dispatch_to_common_tag_fields,
	fibroblast::data_types::{DecodingContext, XmlAttrs},
	to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult},
};
use lazy_static::lazy_static;
use lazycell::LazyCell;
use regex::{Regex, RegexBuilder};
use serde::Serialize;
pub(in crate::fibroblast::tags) use unvalidated::UnvalidatedNestedSvgTag;

lazy_static! {
	static ref XML_HEADER_RE: Regex = RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap();
}

#[derive(Serialize, Debug, Clone)]
pub struct NestedSvgTag<'a> {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,

	#[serde(skip)]
	_text: LazyCell<String>,
}

impl<'a> TryFrom<UnvalidatedNestedSvgTag> for NestedSvgTag<'a> {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedNestedSvgTag) -> Result<Self, Self::Error> {
		let UnvalidatedNestedSvgTag {
			svg_path,
			common_tag_fields,
		} = value;
		let common_tag_fields = common_tag_fields.try_into()?;

		Ok(Self {
			svg_path,
			common_tag_fields,
			_text: LazyCell::new(),
		})
	}
}

dispatch_to_common_tag_fields!(impl HasVars for NestedSvgTag<'_>);

impl<'a> HasCommonTagFields<'a> for NestedSvgTag<'a> {
	fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	fn base_children(&'a self) -> &'a [AnyChildTag<'a>] {
		&[]
	}

	fn base_text(&self) -> &str {
		self._text
			.borrow()
			.expect("called `NestedSvgTag::base_text` before initializing")
	}

	fn should_escape_text(&self) -> bool {
		false
	}
}

impl<'a> NestedSvgTag<'a> {
	pub(super) fn initialize(&self, context: &DecodingContext<'_>) -> ClgnDecodingResult<()> {
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

	pub(super) fn children(&'a self) -> &'a [AnyChildTag<'a>] {
		self.base_children()
	}
}
