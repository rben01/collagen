use crate::fibroblast::tags::{TagVariables, XmlAttrs};
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub(crate) struct UnvalidatedNestedSvgTag {
	/// The path to the SVG relative to the folder root
	pub(super) svg_path: String,

	#[serde(default)]
	pub(super) vars: Option<TagVariables>,

	#[serde(default)]
	pub(super) attrs: Option<XmlAttrs>,
}
