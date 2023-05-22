use super::FontTag;
use crate::fibroblast::tags::{
	container_tag::UnvalidatedContainerTag, foreach_tag::UnvalidatedForeachTag,
	image_tag::UnvalidatedImageTag, nested_svg_tag::UnvalidatedNestedSvgTag,
	other_tag::UnvalidatedOtherTag,
};
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
#[serde(untagged)]
pub(crate) enum UnvalidatedAnyChildTag {
	Image(UnvalidatedImageTag),
	Container(UnvalidatedContainerTag),
	NestedSvg(UnvalidatedNestedSvgTag),
	Foreach(UnvalidatedForeachTag),
	Font(FontTag),
	Other(UnvalidatedOtherTag),
}
