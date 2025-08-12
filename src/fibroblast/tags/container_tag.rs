use super::{
	any_child_tag::AnyChildTagDiscriminants, validation::Validatable, ClgnDecodingResult,
	DecodingContext, Extras,
};
#[cfg(not(feature = "cli"))]
use crate::from_json::ClgnDecodingError;
use crate::{
	fibroblast::Fibroblast,
	filesystem::{InMemoryFs, ProvidedInput},
	from_json::decoding_error::InvalidSchemaErrorList,
	to_svg::svg_writable::{write_tag, SvgWritable},
};

#[cfg(feature = "cli")]
use crate::filesystem::DiskBackedFs;
use compact_str::CompactString;
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, marker::PhantomData, rc::Rc};

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
#[derive(Debug, Clone, Serialize)]
pub struct ContainerTag {
	#[serde(flatten)]
	inner: Inner,

	#[serde(skip)]
	fibroblast: RefCell<Option<Fibroblast>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	clgn_path: CompactString,
}

impl SvgWritable for ContainerTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		self.instantiate(context)?;

		let fb = self.fibroblast.borrow();
		let Fibroblast { root, context } = fb.as_ref().unwrap(); // instantiated above

		write_tag(writer, "g", root.attrs(), |writer| {
			for child in root.children() {
				child.to_svg(writer, context)?;
			}
			Ok(())
		})
	}
}

impl ContainerTag {
	pub(crate) fn instantiate(&self, context: &DecodingContext) -> ClgnDecodingResult<()> {
		let abs_clgn_path = context.canonicalize(&self.inner.clgn_path)?;

		let new_input = match context {
			#[cfg(feature = "cli")]
			DecodingContext::RootPath(_) => ProvidedInput::DiskBackedFs(DiskBackedFs::new(&abs_clgn_path)),
			#[cfg(not(feature = "cli"))]
			DecodingContext::RootPath(_) => {
				return Err(ClgnDecodingError::InvalidSchema(
					crate::from_json::decoding_error::InvalidSchemaErrorList::default(),
				));
			}
			DecodingContext::InMemoryFs(fs) => ProvidedInput::InMemoryFs(
				InMemoryFs {
					root_path: abs_clgn_path,
					content: Rc::clone(&fs.content),
				},
				PhantomData,
			),
		};

		let subroot = Fibroblast::new(&new_input, None)?;

		self.fibroblast.replace(Some(subroot));

		Ok(())
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UnvalidatedContainerTag {
	#[serde(flatten)]
	inner: Inner,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedContainerTag {
	type Validated = ContainerTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner { clgn_path },
			extras,
		} = self;

		if let Err(e) = extras.ensure_empty(AnyChildTagDiscriminants::Container.name()) {
			errors.push(e);
		}

		if errors.is_empty() {
			Ok(ContainerTag {
				inner: Inner { clgn_path },
				fibroblast: RefCell::default(),
			})
		} else {
			Err(())
		}
	}
}
