use super::{common_tag_fields::CommonTagFields, AnyChildTag, TagVariables, XmlAttrs};
use serde::{Deserialize, Serialize};

/// `OtherTag` is a generic tag that doesn't need to be handled specially, such as
/// `<rect>`, which needs no special. This is different from, say, `<image>`, which
/// needs some extra work and thus requires the specialized `Imagetag`.
///
/// `OtherTag`'s tag name — the thing between the angle brackets (`rect` in `<rect>`) —
/// is determined by the `tag_name` field. `OtherTag` supports all fields in [`CommonTagFields`].
///
/// # Properties
///
/// - `tag_name`
///   - Type: string
///   - Required: Yes.
///   - Description: The tag's name. For instance, to make a `<rect>` tag, use
///     `"tag_name": "rect"`.
/// - Other: `OtherTag` accepts all properties in [`CommonTagFields`].
#[derive(Serialize, Deserialize, Debug)]
pub struct OtherTag<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> OtherTag<'a> {
	pub(crate) fn new(tag_name: String, common_tag_fields: CommonTagFields<'a>) -> Self {
		Self {
			tag_name,
			common_tag_fields,
		}
	}

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

	pub(super) fn should_escape_text(&self) -> bool {
		self.common_tag_fields.should_escape_text()
	}
}
