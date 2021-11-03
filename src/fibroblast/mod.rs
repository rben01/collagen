//!
//! # Fibroblast
//!
//! The module that defines the structs that form the in-memory representation of a
//! Collagen file
//!
//! This file contains the following types:
//! 1. `struct` [`RootTag`], which represents the SVG root (`<svg>...</svg>`)
//! 1. `enum` [`AnyChildTag`], whose variants are the distinct kinds of child tags. Most
//!    tags are representible by the catchall variant `Other(OtherTag)`, but if a tag is
//!    best expressed as a more specific type, then you can just create that type and
//!    add a variant to `AnyChildTag` that wraps it. The current variants of
//!    `AnyChildTag` are:
//!     1. [`Container(ContainerTag)`](self::ContainerTag), which is used for nested
//!        Collagen files
//!     1. [`Image(ImageTag)`](self::ImageTag), which is used for embedded images
//!     1. [`Other(OtherTag)`](self::OtherTag), which is used for everything else
//! 1. The types wrapped by variants of [`AnyChildTag`]
//! 1. `struct` [`CommonTagFields`], which is a simple type holding the members common
//!    to all tags (tag name, attributes, children, etc.)
//!
//! Serialization and deserialization are implemented for all tag-like types. For most
//! tag-like types, `#[derive(Serialize, Deserialize)]` is sufficient to adopt the
//! correct behavior.
//!
//! CAUTION: For simplicity, [`AnyChildTag`] uses `serde`'s `untagged` deserialization
//! option. This means that the choice of variant into which a map will be decoded is
//! determined entirely by the map's keys. For instance, the presence of the
//! `"image_path"` key will cause the tag to be decoded into an [`ImageTag`]. Therefore,
//! when defining a new kind of child tag, you must ensure that the set of fields
//! required to deserialize it neither contains nor is contained by the set of required
//! fields of any other child tag; otherwise deserialization will be
//! ambiguous.[^ambiguity] Note that a struct's set of *required* fields may be quite
//! small, so be mindful when choosing names for keys.
//!
//! [^ambiguity] Technically, it's not ambiguous; `serde` picks the first variant for
//! which deserialization succeeds, so it depends on the order of the variants of
//! [`AnyChildTag`].

pub(super) mod data_types;
pub(crate) mod tags;

pub use super::from_json::decoding_error::ClgnDecodingResult;
pub use crate::fibroblast::data_types::DecodingContext;
use data_types::TagVariables;
use std::borrow::Cow;
use tags::{any_child_tag::AnyChildTag, root_tag::RootTag};

/// The whole shebang: both the (context-less) root tag
#[derive(Debug)]
pub struct Fibroblast<'a> {
	pub(crate) root: RootTag<'a>,
	pub(crate) context: DecodingContext<'a>,
}

impl<'a> Fibroblast<'a> {
	pub(crate) fn vars(&self) -> &TagVariables {
		self.root.vars(&self.context)
	}

	pub(crate) fn children(&self) -> &[AnyChildTag<'a>] {
		self.root.children()
	}

	pub(crate) fn text(&'a self) -> ClgnDecodingResult<Cow<'a, str>> {
		self.root.text(&self.context)
	}
}
