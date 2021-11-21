//! This file exposes the different kinds of tags — types implementing trait `TagLike`
//! The different kinds of tags are listed below:
//! - [`RootTag`]: the SVG root (`<svg>...</svg>`)
//! - [`AnyChildTag`]: an enum wrapping one of the following child tags
//!   - [`ImageTag`]: a tag representing an image file on disk
//!   - [`FontTag`]: a tag used to include a woff2 font file on disk
//!   - [`ContainerTag`]: a tag wrapping another Collagen folder on disk
//!   - [`OtherTag`]: the most general option; represents any other kind of SVG tag

use std::borrow::Cow;

pub(self) use super::data_types::{AttrKVValueVec, Map, TagVariables, XmlAttrs};
pub(self) use crate::fibroblast::data_types::DecodingContext;
pub(self) use crate::to_svg::svg_writable::ClgnDecodingResult;
use lazy_static::lazy_static;

pub(super) mod any_child_tag;
pub(super) mod common_tag_fields;
pub(super) mod container_tag;
pub(super) mod font_tag;
pub(super) mod image_tag;
pub(super) mod other_tag;
pub(super) mod root_tag;

pub use any_child_tag::AnyChildTag;
pub use container_tag::ContainerTag;
pub use font_tag::FontTag;
pub use image_tag::ImageTag;
pub use other_tag::OtherTag;
pub use root_tag::RootTag;

lazy_static! {
	/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
	/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
	/// almost nothing
	pub(crate) static ref EMPTY_ATTRS: XmlAttrs = XmlAttrs(Map::new());
	pub(crate) static ref EMPTY_VARS: TagVariables = TagVariables(Map::new());
}

pub(crate) trait TagLike<'a> {
	fn tag_name(&self) -> &str;
	fn vars(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<&TagVariables>;
	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<AttrKVValueVec<'a>>;
	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Cow<'a, str>>;
	fn should_escape_text(&self) -> bool;
}
