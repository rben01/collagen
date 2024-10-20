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
pub(super) mod container_tag;
pub(crate) mod element;
pub(super) mod error_tag;
pub(super) mod font_tag;
pub(super) mod foreach_tag;
pub(super) mod generic_tag;
pub(super) mod if_tag;
pub(super) mod image_tag;
pub(super) mod nested_svg_tag;
pub mod root_tag;
pub(super) mod text_tag;

use self::element::{TagVariables, XmlAttrs};
pub(super) use crate::{
	fibroblast::data_types::DecodingContext, to_svg::svg_writable::ClgnDecodingResult, utils::Map,
};
pub use any_child_tag::AnyChildTag;
pub use container_tag::ContainerTag;
pub use error_tag::{ErrorTag, ErrorTagReason};
pub use font_tag::FontTag;
pub use foreach_tag::ForeachTag;
pub use generic_tag::GenericTag;
pub use if_tag::IfTag;
pub use image_tag::ImageTag;
pub use nested_svg_tag::NestedSvgTag;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
/// almost nothing
pub(crate) static EMPTY_VARS: LazyLock<TagVariables> = LazyLock::new(|| TagVariables(Map::new()));
pub(crate) static EMPTY_ATTRS: LazyLock<XmlAttrs> = LazyLock::new(|| XmlAttrs(Vec::new()));

/// Description: A dictionary whose keys and values will be used to construct the list
/// of `name="value"` XML attributes. For instance, `{ "tag": "circle", "attrs": { "cx":
/// 10, "cy": 20, "r": 5 } }` will be turned into `<circle cx=10 cy=20 r=5></circle>`.
/// Variable substitution and LISP evaluation are performed on the values in `attrs`
/// using `vars`.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct DeXmlAttrs {
	/// (Optional) A dictionary of name="value" XML attributes. None is equivalent to no
	/// attributes.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	attrs: Option<XmlAttrs>,
}

impl AsRef<XmlAttrs> for DeXmlAttrs {
	fn as_ref(&self) -> &XmlAttrs {
		self.attrs.as_ref().unwrap_or(&EMPTY_ATTRS)
	}
}

/// Description: A dictionary mapping variable names to their values. Variables are used
/// for substitutions in other attributes. For instance, if `vars` is `{ "x": 10, "y":
/// 20 }` and `text` is `"{x} {y}"`, then `text` will be converted to `10 20` before
/// inclusion in XML. Also applies to the values in `attrs` and to LISP expressions such
/// as `"{(+ x y)}"` (which would evaluate to 30 in this case).
///
/// As demonstrated above, to indicate that a variable should be substituted into a
/// string, surround the variable name in curly braces (inspired by [Format Args
/// Implicit
/// Identifiers](https://rust-lang.github.io/rfcs/2795-format-args-implicit-identifiers.html),
/// which enables `"{variable}"` in most macros).
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub(crate) struct DeTagVariables {
	/// (Optional) A dictionary mapping variable names to their values. None is
	/// equivalent to no variables.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	vars: Option<TagVariables>,
}

impl AsRef<TagVariables> for DeTagVariables {
	fn as_ref(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&EMPTY_VARS)
	}
}

impl AsMut<Option<TagVariables>> for DeTagVariables {
	fn as_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

/// A list of children of this tag. Each child in the list is an object interpretable as
/// `AnyChildTag`. For example, the `children` in `{ "tag": "g", "children": [{ "tag":
/// "rect", "attrs": ... }, { "image_path": ... }] }`
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub(crate) struct DeChildTags<'a> {
	/// (Optional) A dictionary mapping variable names to their values. None is
	/// equivalent to no variables.
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub(crate) children: Option<Vec<AnyChildTag<'a>>>,
}

impl<'a> AsRef<[AnyChildTag<'a>]> for DeChildTags<'a> {
	fn as_ref(&self) -> &[AnyChildTag<'a>] {
		self.children.as_deref().unwrap_or(&[])
	}
}

// pub(crate) trait TagLike<'a> {
// 	fn tag_name(&self) -> Option<&str>;
// 	fn vars(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<&TagVariables>;
// 	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<XmlAttrsBorrowed<'a>>;
// 	fn children(
// 		&'a self,
// 		context: &DecodingContext<'a>,
// 	) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]>;
// 	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Option<BytesText>>;
// }
