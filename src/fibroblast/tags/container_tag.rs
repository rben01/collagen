use super::{
	any_child_tag::AnyChildTag, traits::HasCommonTagFields, AttrKVValueVec, ClgnDecodingResult,
	DecodingContext, TagVariables,
};
use crate::fibroblast::Fibroblast;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// `ContainerTag` allows the nesting of skeletons in other skeletons. If (valid)
///  skeletons A and B exist, and you wish to include B as is in A, just use a container
///  tag. B will be inserted directly into the body of A, with its `<svg>` tag replaced
///  with a `<g>` tag.
///
/// Typically, the folder B should reside inside folder A so that A can be sent as is or
/// as a single file (say, as a zip or tarball) instead of needing to send B alongside
/// A.
///
/// Here is an example of a simple container tag:
///
/// ```json
/// { "clgn_path": "path/to/skeleton" }
/// ```
///
/// # Properties
///
/// - `clgn_path`
///   - Type: string
///   - Required: Yes.
///   - Description: The path, relative to `collagen.json`, of the skeleton to include
///     in this skeleton.
/// - Other: `ContainerTag` does *not* accept the fields in `CommonTagFields`. To apply
///   attributes to a `ContainerTag`, wrap it in a `<g>` tag, e.g., `{ "tag": "g",
///   "attrs": ..., "children": [{ "clgn_path": ... }] }`
///
/// # Notes
///
/// As a skeleton itself, B's root tag is, well, a `RootTag`, which gets decoded into an
/// `<svg>` tag. To make `ContainerTag` work, this `<svg>` is just replaced with a
/// `<g>`, and is otherwise left untouched. For instance, adding additional attributes
/// or children to this `<g>` is not possible; instead, just make the `ContainerTag` that
/// includes B the child of another tag, ideally itself another `<g>` tag. For example,
/// if we have
///
/// *B/collagen.json*
/// ```json
/// {
///
///   "children": [
///     {
///       "tag": "rect",
///       "attrs": {
///         "x": 0,
///         "y": 5,
///         "width": 10,
///         "height": 20,
///         "fill": "blue"
///       }
///     }
///   ]
/// }
/// ```
///
/// *A/collagen.json*
/// ```json
/// {
///   "attrs": { "viewBox": "0 0 30 30" },
///   "children": [
///     {
///       "tag": "g",
///       "attrs": { "transform": "rotate(-45)" },
///       "children": [{ "clgn_path": "B" }]
///     }
///   ]
/// }
/// ```
///
/// then running `clgn` on `A` will produce the following SVG:
///
/// ```xml
/// <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">
///   <g transform="rotate(-45)">
///     <g>
///       <rect fill="blue" height="30" width="20" x="0" y="10" />
///     </g>
///   </g>
/// </svg>
/// ```
///
/// (The `xmnls="..."` is added automatically if not present in the `collagen.json` file.)
///
/// This specific example is in `tests/examples/simple-nesting`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerTag<'a> {
	clgn_path: String,

	#[serde(skip)]
	_child_clgn: OnceCell<Fibroblast<'a>>,
}

impl<'a> ContainerTag<'a> {
	pub(crate) fn as_fibroblast(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a Fibroblast<'a>> {
		self._child_clgn.get_or_try_init(|| {
			let context = context.clone();
			let abs_clgn_path =
				crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.clgn_path)?;
			context.replace_root(abs_clgn_path.clone());
			let subroot = Fibroblast::from_dir_with_context(abs_clgn_path, context)?;
			Ok(subroot)
		})
	}

	pub(super) fn tag_name(&self) -> &str {
		"g"
	}

	pub(super) fn vars(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a TagVariables> {
		self.as_fibroblast(context)?.vars()
	}

	pub(super) fn attrs(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let fb = self.as_fibroblast(context)?;
		fb.context.sub_vars_into_attrs(fb.root.base_attrs().iter())
	}

	pub(super) fn children(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
		Ok(self.as_fibroblast(context)?.children())
	}

	pub(super) fn text(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, str>> {
		self.as_fibroblast(context)?.text()
	}

	pub(super) fn should_escape_text(&self) -> bool {
		false
	}
}
