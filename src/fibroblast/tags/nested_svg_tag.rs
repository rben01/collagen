use super::any_child_tag::AnyChildTag;
use super::common_tag_fields::CommonTagFields;
use super::OtherTag;
use crate::fibroblast::data_types::{DecodingContext, TagVariables, XmlAttrs};
use crate::to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult};
use lazycell::LazyCell;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct NestedSvgTag<'a> {
	/// The path to the SVG relative to the folder root
	svg_path: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,

	#[serde(skip)]
	#[serde(default)]
	_text: LazyCell<String>,

	#[serde(skip)]
	#[serde(default)]
	_child: LazyCell<Box<AnyChildTag<'a>>>,
}

impl<'a> NestedSvgTag<'a> {
	pub(super) fn initialize(&self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		match self._child.borrow() {
			Some(_child) => Ok(()),
			None => {
				let context = context.clone();
				let abs_svg_path =
					crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.svg_path)?;

				let text = std::fs::read_to_string(&abs_svg_path)
					.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;

				self._text.fill(text.clone()).unwrap();

				let svg_container = AnyChildTag::Other(OtherTag::new(
					"g".into(),
					CommonTagFields::new_with_text(text),
				));

				self._child.fill(Box::new(svg_container)).unwrap();
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
		let child = self
			._child
			.borrow()
			.expect("called `NestedSvgTag::children` before initializing");
		std::slice::from_ref(child)
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
