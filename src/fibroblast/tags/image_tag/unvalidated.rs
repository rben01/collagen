use crate::fibroblast::tags::common_tag_fields::UnvalidatedCommonTagFields;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct UnvalidatedImageTag {
	/// The path to the image relative to the folder root
	pub(super) image_path: String,

	/// The image "kind" (usually synonymous with file extension). If `None`, will be
	/// set to the file extension of `image_path`
	#[serde(default)]
	pub(super) kind: Option<String>,

	#[serde(flatten)]
	pub(super) common_tag_fields: UnvalidatedCommonTagFields,
}
