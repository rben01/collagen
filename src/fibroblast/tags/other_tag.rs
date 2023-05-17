use crate::dispatch_to_common_tag_fields;

use super::common_tag_fields::{CommonTagFields, HasCommonTagFields};
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
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OtherTag<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> OtherTag<'a> {
	pub(super) fn tag_name(&self) -> &str {
		self.tag_name.as_ref()
	}
}

dispatch_to_common_tag_fields!(impl HasVars for OtherTag<'_>);
dispatch_to_common_tag_fields!(impl<'a> HasCommonTagFields<'a> for OtherTag<'a>);
