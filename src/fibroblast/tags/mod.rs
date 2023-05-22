//! This file exposes the different kinds of tags. `RootTag` and `AnyChildTag` are
//! high-level tags; the former is the document root and the latter simply exists to
//! wrap more specific child tags.
//!
//! During deserialization, objects are converted to an in-memory tag; not only is this
//! tag's data specified by the object's key-value pairs, but in addition, the *kind* of
//! tag to deserialize into is determined from the object's set of keys. For instance,
//! this tag will be decoded into a plain old `<circle>`:
//!
//! ```json
//! { "tag": "circle", "attrs": { ... } }
//! ```
//!
//! Whereas this one will be decoded into an `<image>`, with the image at
//! `"path/to/image"` embedded in the resulting SVG:
//!
//! ```json
//! { "image_path": "path/to/image" }
//! ```
//!
//! Documentation on the precise data format expected by a given kind of tag is in that
//! tag's own documentation. Most tags accept (but don't require) the keys in
//! [`CommonTagFields`][CommonTagFields]. Read an individual tag type's documentation
//! for more info.
//!
//! At a high level, the two kinds of tags are:
//! - [`RootTag`]: The SVG root (`<svg>...</svg>`). Contains all other child tags. There
//!   is exactly one of these per skeleton, and it's the top level object in
//!   `collagen.json`.
//! - [`AnyChildTag`]: An enum wrapping any one of a number of distinct kinds of child
//!   tags. See its docs for more info.

pub(super) mod any_child_tag;
pub(super) mod common_tag_fields;
pub(super) mod container_tag;
pub(super) mod font_tag;
pub(super) mod foreach_tag;
pub(super) mod image_tag;
pub(super) mod nested_svg_tag;
pub(super) mod other_tag;
pub(super) mod root_tag;

pub(self) use super::data_types::{AttrKVValueVec, Map, TagVariables, XmlAttrs};
pub(self) use crate::{
	fibroblast::data_types::DecodingContext, to_svg::svg_writable::ClgnDecodingResult,
};
pub use any_child_tag::AnyChildTag;
pub use common_tag_fields::{traits, CommonTagFields};
pub use container_tag::ContainerTag;
pub use font_tag::FontTag;
pub use foreach_tag::ForeachTag;
pub use image_tag::ImageTag;
pub use nested_svg_tag::NestedSvgTag;
use once_cell::sync::Lazy;
pub use other_tag::OtherTag;
pub use root_tag::RootTag;
pub(crate) use root_tag::UnvalidatedRootTag;
use std::borrow::Cow;

/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
/// almost nothing
pub(crate) static EMPTY_ATTRS: Lazy<XmlAttrs> = Lazy::new(|| XmlAttrs(Map::new()));
pub(crate) static EMPTY_VARS: Lazy<TagVariables> = Lazy::new(|| TagVariables(Map::new()));

pub(crate) trait TagLike<'a> {
	fn tag_name(&self) -> &str;
	fn vars(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<&TagVariables>;
	fn attrs(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<AttrKVValueVec<'a>>;
	fn text(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<Cow<'a, str>>;
	fn should_escape_text(&'a self) -> bool;
}
