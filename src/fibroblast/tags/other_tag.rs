use super::{common_tag_fields::CommonTagFields, AnyChildTag, TagVariables, XmlAttrs};
use serde::{Deserialize, Serialize};

/// A generic tag that doesn't need to be handled specially. (e.g., `<rect>` needs no
/// special handling and so would be suitable for `OtherTag`, whereas `<image>` needs
/// some extra work and thus requires the specific `Imagetag`)
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTag<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> OtherTag<'a> {
	pub(super) fn tag_name(&self) -> &str {
		self.tag_name.as_ref()
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(super) fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	pub(super) fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(super) fn should_encode_text(&self) -> bool {
		self.common_tag_fields.should_encode_text()
	}
}
