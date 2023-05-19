use super::{
	any_child_tag::AnyChildTag, common_tag_fields::HasCommonTagFields, AttrKVValueVec,
	ClgnDecodingResult, DecodingContext, TagVariables,
};
use crate::fibroblast::Fibroblast;
use lazycell::LazyCell;
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
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ContainerTag<'a> {
	// TODO: Should this be renamed "{import,include}{,_path,ing,s}"? Leaning towards simply "include"
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
				let abs_clgn_path =
					crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.clgn_path)?;

				context.replace_root(abs_clgn_path.clone());

				let subroot = Fibroblast::from_dir_with_context(abs_clgn_path, context)?;
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

	pub(super) fn should_escape_text(&self) -> bool {
		false
	}
}
