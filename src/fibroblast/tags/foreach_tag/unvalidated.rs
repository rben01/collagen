use super::{iterable::UnvalidatedIterable, loop_variable::UnvalidatedLoopVariable};
use crate::fibroblast::tags::{
	any_child_tag::unvalidated::UnvalidatedAnyChildTag,
	common_tag_fields::UnvalidatedCommonTagFields,
};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct UnvalidatedForeachTag {
	#[serde(rename = "for_each")]
	pub(super) iterable: UnvalidatedIterable<UnvalidatedLoopVariable>,
	pub(super) template: Box<UnvalidatedAnyChildTag>,
	pub(super) common_tag_fields: UnvalidatedCommonTagFields,
}
