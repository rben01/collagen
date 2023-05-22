use crate::fibroblast::tags::common_tag_fields::UnvalidatedCommonTagFields;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct UnvalidatedNestedSvgTag {
	/// The path to the SVG relative to the folder root
	pub(super) svg_path: String,

	#[serde(flatten)]
	pub(super) common_tag_fields: UnvalidatedCommonTagFields,
}
