/*!
# Fibroblast

The module that defines the structs that form the in-memory representation of a Collagen file

This file defines one trait and three main types that all implement the trait:
1. [`TagLike`], the trait for all tag-like objects
1. [`RootTag`], the SVG document root
1. [`ChildTag`], an enum wrapping any of the various child tag types
1. Concrete child tags, which include tags that need special handling,
such as [`ImageTag`], as well as the general [`OtherTag`], which covers all other SVG tags.
These are wrapped in a variant of [`ChildTag`]

In this file, serialization and deserialization are implemented for all `TagLike` types.
For most `TagLike` types, `#[derive(Serialize, Deserialize)]` is sufficient to adopt the correct behavior.

CAUTION: For simplicity, [`ChildTag`] uses `serde`'s `untagged` deserialization option. This means that
the choice of variant into which a map will be decoded is determined
entirely by the map's keys. Therefore, when defining a new kind of
child tag, you must ensure that the set of fields used to deserialize it neither
contains nor is contained by the set of fields of any other
child tag; otherwise deserialization will be ambiguous.[^ambiguity]

[^ambiguity] Technically, it's not ambiguous; `serde` picks the first variant for which
deserialization succeeds, so it depends on the order of the variants of [`ChildTag`].
*/

pub(super) mod data_types;

use data_types::SimpleValue;

use lazy_static::lazy_static;

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::BTreeMap; // https://users.rust-lang.org/t/hashmap-vs-btreemap/13804/3
use std::path::PathBuf;

/// A type alias for storing XML attribute key-value pairs
pub(crate) type XmlAttrs = BTreeMap<String, SimpleValue>;

// fn attrs_to_iterable_pairs(attrs: &XmlAttrs) -> AttrKVIteratorResult {
// 	Ok(Box::from(
// 		attrs.iter().map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
// 	))
// }

lazy_static! {
	static ref EMPTY_MAP: XmlAttrs = XmlAttrs::new();
}

pub(crate) trait TagLike {
	fn tag_name(&self) -> &str;
	fn attrs(&self) -> &XmlAttrs;
	fn children(&self) -> &[ChildTag];
	fn text(&self) -> &str;
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ImageTag {
	image_path: String,

	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	kind: Option<String>,
}

impl ImageTag {
	pub(crate) fn image_path(&self) -> &str {
		&self.image_path
	}

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

	fn text(&self) -> &str {
		""
	}

	fn children(&self) -> &[ChildTag] {
		&[]
	}

	fn attrs(&self) -> &XmlAttrs {
		&self.attrs
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTag {
	tag: String,

	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	children: Vec<ChildTag>,

	#[serde(default)]
	text: String,
}

impl TagLike for OtherTag {
	fn tag_name(&self) -> &str {
		&self.tag
	}

	fn text(&self) -> &str {
		&self.text
	}

	fn children(&self) -> &[ChildTag] {
		&self.children
	}

	fn attrs(&self) -> &XmlAttrs {
		&self.attrs
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

	fn text(&self) -> &str {
		match self {
			Self::Image(t) => t.text(),
			Self::Other(t) => t.text(),
		}
	}

	fn children(&self) -> &[ChildTag] {
		match self {
			Self::Image(t) => t.children(),
			Self::Other(t) => t.children(),
		}
	}

	fn attrs(&self) -> &XmlAttrs {
		match self {
			Self::Image(t) => t.attrs(),
			Self::Other(t) => t.attrs(),
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RootTag {
	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<ChildTag>>,

	#[serde(default)]
	text: Option<String>,

	#[serde(default)]
	vars: Option<Vec<String>>,
}

impl TagLike for RootTag {
	fn tag_name(&self) -> &str {
		"svg"
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

	fn attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			Some(attrs) => attrs,
			None => &EMPTY_MAP,
		}
	}
}
