use super::{ClgnDecodingResult, DecodingContext};
use crate::{
	fibroblast::Fibroblast,
	impl_trivially_validatable,
	to_svg::svg_writable::{write_tag, SvgWritable},
};
use compact_str::CompactString;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, path::PathBuf};

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
#[serde(deny_unknown_fields)]
pub struct ContainerTag {
	clgn_path: CompactString,

	#[serde(skip)]
	resolved_path: RefCell<Option<PathBuf>>,

	#[serde(skip)]
	fibroblast: RefCell<Option<Fibroblast>>,
}

impl SvgWritable for ContainerTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		self.instantiate(context)?;

		let fb = self.fibroblast.borrow();
		let Fibroblast { root, context } = fb.as_ref().unwrap();

		write_tag(
			writer,
			"g",
			|elem| {
				root.attrs().write_into(elem);
				Ok(())
			},
			|writer| {
				for child in root.children() {
					child.to_svg(writer, context)?;
				}
				Ok(())
			},
		)
	}
}

impl ContainerTag {
	pub(crate) fn instantiate(&self, context: &DecodingContext) -> ClgnDecodingResult<()> {
		let abs_clgn_path =
			crate::utils::paths::pathsep_aware_join(&*context.get_root(), &self.clgn_path)?;

		if self.resolved_path.borrow().as_ref() != Some(&abs_clgn_path) {
			let context = context.clone();
			context.replace_root(abs_clgn_path.clone());
			let subroot = Fibroblast::from_dir_with_context(&abs_clgn_path, context)?;

			self.fibroblast.replace(Some(subroot));
			self.resolved_path.replace(Some(abs_clgn_path));
		};

		Ok(())
	}
}

impl_trivially_validatable!(ContainerTag);
