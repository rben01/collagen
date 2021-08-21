//!
//! # Fibroblast
//!
//! The module that defines the structs that form the in-memory representation of a
//! Collagen file
//!
//! This file defines one trait and three main types that all implement the trait:
//! 1. [`TagLike`], the trait for all tag-like objects
//! 1. [`RootTag`], the SVG document root
//! 1. [`ChildTag`], an enum wrapping any of the various child tag types
//! 1. Concrete child tags, which include tags that need special handling, such as
//!    [`ImageTag`], as well as the general [`OtherTag`], which covers all other SVG
//!    tags. These are wrapped in a variant of [`ChildTag`]
//!
//! In this file, serialization and deserialization are implemented for all `TagLike`
//! types. For most `TagLike` types, `#[derive(Serialize, Deserialize)]` is sufficient
//! to adopt the correct behavior.
//!
//! CAUTION: For simplicity, [`ChildTag`] uses `serde`'s `untagged` deserialization
//! option. This means that the choice of variant into which a map will be decoded is
//! determined entirely by the map's keys. Therefore, when defining a new kind of child
//! tag, you must ensure that the set of fields required to deserialize it neither
//! contains nor is contained by the set of required fields of any other child tag;
//! otherwise deserialization will be ambiguous.[^ambiguity] Note that a Struct's set of
//! *required* fields may be quite small, so be mindful when choosing names for keys.
//!
//! [^ambiguity] Technically, it's not ambiguous; `serde` picks the first variant for
//! which deserialization succeeds, so it depends on the order of the variants of
//! [`ChildTag`].

pub(super) mod data_types;

use data_types::{SimpleValue, VariableValue};

use lazy_static::lazy_static;

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::BTreeMap; // https://users.rust-lang.org/t/hashmap-vs-btreemap/13804/3
use std::path::PathBuf;

/// A type alias for storing XML attribute key-value pairs
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct XmlAttrs(pub(crate) BTreeMap<String, SimpleValue>);

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct TagVariables(pub(crate) BTreeMap<String, VariableValue>);

lazy_static! {
	/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
	/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
	/// nothing
	pub(crate) static ref EMPTY_ATTRS: XmlAttrs = XmlAttrs(BTreeMap::new());

	pub(crate) static ref EMPTY_VARS: TagVariables = TagVariables(BTreeMap::new());

}

/// Traits common to all XML tags
pub(crate) trait TagLike {
	fn tag_name(&self) -> &str;
	fn vars(&self) -> &Option<TagVariables>;
	fn raw_attrs(&self) -> &XmlAttrs;
	fn children(&self) -> &[ChildTag];
	fn text(&self) -> &str;
}

/// A tag for handling images. We handle images specially (that's the whole point), so
/// we need a separate type for their tags.
#[derive(Serialize, Deserialize, Debug)]
pub struct ImageTag {
	/// The path to the image relative to the folder root
	image_path: String,

	#[serde(default)]
	kind: Option<String>,

	#[serde(rename = "$vars")]
	#[serde(default)]
	vars: Option<TagVariables>,

	/// The tag's attrs
	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<ChildTag>>,

	#[serde(default)]
	text: Option<String>,
}

impl ImageTag {
	pub(crate) fn image_path(&self) -> &str {
		&self.image_path
	}

	/// The kind of the image (e.g., `"jpg"`, `"png"`). If `None`, the `kind` will be
	/// inferred from the file extension of `image_path`. The case of file extensions is
	/// ignored.
	pub(crate) fn kind(&self) -> Option<Cow<'_, str>> {
		match &self.kind {
			Some(kind) => Some(Cow::Borrowed(kind)),
			None => {
				let path = PathBuf::from(&self.image_path);
				let extn = path.extension()?.to_str()?.to_ascii_lowercase();
				Some(Cow::Owned(extn))
			}
		}
	}
}

impl TagLike for ImageTag {
	fn tag_name(&self) -> &str {
		"image"
	}

	fn vars(&self) -> &Option<TagVariables> {
		&self.vars
	}

	fn raw_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			Some(attrs) => attrs,
			None => &EMPTY_ATTRS,
		}
	}

	fn children(&self) -> &[ChildTag] {
		match &self.children {
			Some(children) => children.as_ref(),
			None => &[],
		}
	}

	fn text(&self) -> &str {
		match &self.text {
			Some(text) => text.as_ref(),
			None => "",
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTag {
	#[serde(default)]
	#[serde(rename = "$vars")]
	vars: Option<TagVariables>,

	tag: String,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<ChildTag>>,

	#[serde(default)]
	text: Option<String>,
}

impl TagLike for OtherTag {
	fn tag_name(&self) -> &str {
		&self.tag
	}

	fn vars(&self) -> &Option<TagVariables> {
		&self.vars
	}

	fn raw_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			Some(attrs) => attrs,
			None => &EMPTY_ATTRS,
		}
	}

	fn children(&self) -> &[ChildTag] {
		match &self.children {
			Some(children) => children.as_ref(),
			None => &[],
		}
	}

	fn text(&self) -> &str {
		match &self.text {
			Some(text) => text.as_ref(),
			None => "",
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum ChildTag {
	Image(ImageTag),
	Other(OtherTag),
}

impl TagLike for ChildTag {
	// Is there a way to dedupe this?

	fn tag_name(&self) -> &str {
		match self {
			Self::Image(t) => t.tag_name(),
			Self::Other(t) => t.tag_name(),
		}
	}

	fn vars(&self) -> &Option<TagVariables> {
		match self {
			Self::Image(t) => t.vars(),
			Self::Other(t) => t.vars(),
		}
	}

	fn raw_attrs(&self) -> &XmlAttrs {
		match self {
			Self::Image(t) => t.raw_attrs(),
			Self::Other(t) => t.raw_attrs(),
		}
	}

	fn children(&self) -> &[ChildTag] {
		match self {
			Self::Image(t) => t.children(),
			Self::Other(t) => t.children(),
		}
	}

	fn text(&self) -> &str {
		match self {
			Self::Image(t) => t.text(),
			Self::Other(t) => t.text(),
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct RootTag {
	#[serde(default)]
	#[serde(rename = "$vars")]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<ChildTag>>,

	#[serde(default)]
	text: Option<String>,
}

impl TagLike for RootTag {
	fn tag_name(&self) -> &str {
		"svg"
	}

	fn vars(&self) -> &Option<TagVariables> {
		&self.vars
	}

	fn text(&self) -> &str {
		match &self.text {
			Some(text) => text.as_ref(),
			None => "",
		}
	}

	fn children(&self) -> &[ChildTag] {
		match &self.children {
			Some(children) => children,
			None => &[],
		}
	}

	fn raw_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			Some(attrs) => attrs,
			None => &EMPTY_ATTRS,
		}
	}
}
