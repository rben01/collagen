use crate::fibroblast::tags::common_tag_fields::unvalidated::UnvalidatedCommonTagFields;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct UnvalidatedRootTag {
	#[serde(flatten)]
	pub(super) common_tag_fields: UnvalidatedCommonTagFields,
}
