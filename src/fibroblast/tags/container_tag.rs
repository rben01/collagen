use super::{
	any_child_tag::AnyChildTag, AttrKVValueVec, ClgnDecodingResult, DecodingContext, TagVariables,
};
use crate::fibroblast::Fibroblast;
use lazycell::LazyCell;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// `ContainerTag` allows the nesting of Collagen files. By specifying the relative path
/// to another skeleton, that skeleton will be included as-is in the current skeleton.
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ContainerTag<'a> {
	clgn_path: String,

	#[serde(skip)]
	#[serde(default)]
	_child_clgn: LazyCell<Fibroblast<'a>>,
}

impl<'a> ContainerTag<'a> {
	/// If not filled, fill in this `ContainerTag` with the `Fibroblast` given by
	/// `self.clgn_path`. Always returns the contained `Fibroblast`
	pub(super) fn initialize(
		&self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<&Fibroblast<'a>> {
		match self._child_clgn.borrow() {
			Some(fb) => Ok(fb),
			None => {
				let context = context.clone();
				let abs_clgn_path = context.get_root().join(&self.clgn_path);

				context.replace_root(&abs_clgn_path);

				let subroot = Fibroblast::from_dir_with_context(&abs_clgn_path, context)?;
				self._child_clgn.fill(subroot).unwrap();
				Ok(self._child_clgn.borrow().unwrap())
			}
		}
	}

	pub(crate) fn as_fibroblast(&self) -> &Fibroblast<'a> {
		self._child_clgn.borrow().unwrap()
	}

	pub(super) fn tag_name(&self) -> &str {
		"g"
	}

	pub(super) fn vars(&'a self) -> ClgnDecodingResult<&TagVariables> {
		self.as_fibroblast().vars()
	}

	pub(super) fn attrs(&'a self) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let fb = self.as_fibroblast();
		fb.context.sub_vars_into_attrs(
			fb.root
				.base_attrs()
				.0
				.iter()
				.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
		)
	}

	pub(super) fn children(&'a self) -> &[AnyChildTag<'a>] {
		self.as_fibroblast().children()
	}

	pub(super) fn text(&'a self) -> ClgnDecodingResult<Cow<'a, str>> {
		self.as_fibroblast().text()
	}

	pub(super) fn should_encode_text(&self) -> bool {
		false
	}
}
