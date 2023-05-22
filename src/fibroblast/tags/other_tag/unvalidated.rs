use crate::fibroblast::tags::common_tag_fields::UnvalidatedCommonTagFields;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct UnvalidatedOtherTag {
	#[serde(rename = "tag")]
	pub(super) tag_name: String,

	#[serde(flatten)]
	pub(super) common_tag_fields: UnvalidatedCommonTagFields,
}
