mod unvalidated;

use super::common_tag_fields::CommonTagFields;
use crate::{dispatch_to_common_tag_fields, to_svg::svg_writable::ClgnDecodingError};
use serde::Serialize;
pub(in crate::fibroblast::tags) use unvalidated::UnvalidatedOtherTag;

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
#[derive(Serialize, Debug, Clone)]
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

impl<'a> TryFrom<UnvalidatedOtherTag> for OtherTag<'a> {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedOtherTag) -> Result<Self, Self::Error> {
		let UnvalidatedOtherTag {
			tag_name,
			common_tag_fields,
		} = value;
		let common_tag_fields = common_tag_fields.try_into()?;

		Ok(Self {
			tag_name,
			common_tag_fields,
		})
	}
}

dispatch_to_common_tag_fields!(impl HasVars for OtherTag<'_>);
dispatch_to_common_tag_fields!(impl<'a> HasCommonTagFields<'a> for OtherTag<'a>);
