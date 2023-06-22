//!
//! # Fibroblast
//!
//! The module that defines the structs that form the in-memory representation of a
//! Collagen file, [`Fibroblast`]. See its docs for more info.

pub(super) mod data_types;
pub mod tags;

use self::{
	data_types::XmlAttrsBorrowed,
	tags::{
		element::{AsSvgElement, HasVars},
		root_tag::RootTag,
		TagVariables,
	},
};
pub use super::from_json::decoding_error::ClgnDecodingResult;
pub use crate::fibroblast::data_types::DecodingContext;
use std::borrow::Cow;
use tags::AnyChildTag;

/// The whole shebang: both the (context-less) root tag and the context in which to
/// decode it.
///
/// An instance of [`Fibroblast`] contains a [`RootTag`](tags::RootTag), which contains
/// the raw data, as well as a [`DecodingContext`](data_types::DecodingContext), which
/// contains the context in which to decode this data (necessary to e.g., resolve paths
/// referenced by tags).
///
/// Serialization and deserialization are implemented for all tag-like types. For most
/// tag-like types, `#[derive(Serialize, Deserialize)]` is sufficient to adopt the
/// correct behavior.
///
/// CAUTION: For simplicity, [`AnyChildTag`] uses `serde`'s `untagged` deserialization
/// option. This means that the choice of variant into which a map will be decoded is
/// determined entirely by the map's keys. For instance, the presence of the
/// `"image_path"` key will cause the tag to be decoded into an
/// [`ImageTag`](crate::fibroblast::tags::ImageTag). Therefore, when defining a new kind
/// of child tag, you must ensure that the set of fields required to deserialize it
/// neither contains nor is contained by the set of required fields of any other child
/// tag; otherwise deserialization will be ambiguous.[^ambiguity] Note that a struct's
/// set of *required* fields may be quite small, so be mindful when choosing names for
/// keys. (In practice, if you pick reasonably descriptive English names, there
/// shouldn't be overlap.)
///
/// [^ambiguity] Technically, it's not ambiguous; `serde` picks the first variant for
/// which deserialization succeeds, so it depends on the order of the variants of
/// [`AnyChildTag`].
#[derive(Debug, Clone)]
pub struct Fibroblast<'a> {
	pub(crate) root: RootTag<'a>,
	pub(crate) context: DecodingContext<'a>,
}

impl HasVars for Fibroblast<'_> {
	fn vars(&self) -> &TagVariables {
		self.root.vars.as_ref()
	}
}

impl<'a> AsSvgElement<'a> for Fibroblast<'a> {
	fn tag_name(&self) -> &str {
		self.root.tag_name()
	}

	fn attrs<'b>(&'b self, _: &DecodingContext) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>> {
		unreachable!()
	}

	fn children<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>> {
		Ok(self.root.children(context)?)
	}
}
