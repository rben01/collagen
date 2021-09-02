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

pub(crate) mod context;
pub(super) mod data_types;
pub(crate) mod parse_vars;

use lazy_static::lazy_static;
use lazycell::LazyCell;

use context::DecodingContext;
use data_types::{AttrKVValueVec, SimpleValue, TagVariables, XmlAttrs};
use serde::{Deserialize, Serialize};
use std::borrow::{BorrowMut, Cow};

use std::collections::BTreeMap; // https://users.rust-lang.org/t/hashmap-vs-btreemap/13804/3
use std::path::PathBuf;

use crate::fibroblast::context::DecodingScope;
use crate::to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult};
use parse_vars::do_variable_substitution;

lazy_static! {
	/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
	/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
	/// almost nothing
	pub(crate) static  ref EMPTY_ATTRS: XmlAttrs<'static> = XmlAttrs(BTreeMap::new());

	pub(crate) static ref EMPTY_VARS: TagVariables = TagVariables(BTreeMap::new());

}

/// Traits common to all XML tags
pub(crate) trait TagLike {
	fn tag_name(&self) -> &str;
	fn vars<'a>(&'a self, context: &'a DecodingContext) -> &Option<TagVariables>;
	fn attrs<'a>(&'a self, context: &'a DecodingContext) -> ClgnDecodingResult<AttrKVValueVec<'a>>;
	fn children<'a>(
		&'a self,
		context: &'a mut DecodingContext<'a>,
	) -> ClgnDecodingResult<&[ChildTag]>;
	fn text<'a>(&'a self, context: &'a DecodingContext) -> ClgnDecodingResult<Cow<'a, str>>;
}

/// By default, getting the attrs as a list of pairs is just iterating over the
/// underlying Map, mapping wrapping in a Cow, and collecting into a Vec
fn raw_attrs_map_to_subd_attrs_vec<'a>(
	map: &'a XmlAttrs,
	context: &DecodingContext,
) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
	let mut attrs = Vec::with_capacity(map.0.len());

	for (k, v) in map.0.iter() {
		let v = match v {
			SimpleValue::Text(s) => {
				let subd_text = do_variable_substitution(s, context)?;
				Cow::Owned(SimpleValue::Text(subd_text))
			}
			_ => Cow::Borrowed(v),
		};

		attrs.push((k.as_ref(), v));
	}

	Ok(attrs)
}

/// A tag for handling images. We handle images specially (that's the whole point), so
/// we need a separate type for their tags.
#[derive(Serialize, Deserialize, Debug)]
pub struct ImageTagExtras<'a> {
	/// The path to the image relative to the folder root
	image_path: String,

	/// The image "kind" (usually synonymous with file extension)
	#[serde(default)]
	kind: Option<String>,

	#[serde(default)]
	children: Option<Vec<ChildTag<'a>>>,
}

impl<'a> ImageTagExtras<'a> {
	/// The kind of the image (e.g., `"jpg"`, `"png"`). If `self.kind.is_none()`, the
	/// `kind` will be inferred from the file extension of `image_path`. A file
	/// extension's case is ignored.
	pub(crate) fn kind(&self) -> Option<Cow<'a, str>> {
		match &self.kind {
			Some(kind) => Some(Cow::Borrowed(kind)),
			None => {
				let path = PathBuf::from(&self.image_path);
				let extn = path.extension()?.to_str()?.to_ascii_lowercase();
				Some(Cow::Owned(extn))
			}
		}
	}

	pub(crate) fn get_image_attr_pair(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<(&'a str, Cow<'a, SimpleValue>)> {
		let key = "href";

		let kind = match self.kind() {
			Some(kind) => kind,
			None => {
				return Err(ClgnDecodingError::Image(format!(
					r#"Could not deduce the extension from {:?}, and no "kind" was given"#,
					self.image_path
				)));
			}
		};

		// I'd like to find the "right" way to reduce memory usage here. We're reading a
		// file into memory and then storing its b64 string also in memory. That's
		// O(2*n). Ideally none of this would reside in memory, and we'd stream directly
		// to the output SVG. An intermediate step would be to stream the file into the
		// b64 encoder, getting memory usage down to O(1*n).
		let abs_image_path = context.root_path().join(&self.image_path);
		let b64_string = base64::encode(std::fs::read(abs_image_path)?);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		Ok((key, Cow::Owned(SimpleValue::Text(src_str))))
	}

	fn children(&self) -> &[ChildTag] {
		match &self.children {
			Some(c) => c,
			None => &[],
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ContainerTagExtras<'a> {
	clgn_path: String,

	#[serde(skip)]
	#[serde(default)]
	_child_clgn: LazyCell<RootTag<'a>>,
}

impl<'a> ContainerTagExtras<'a> {
	pub(crate) fn children(
		&'a self,
		mut context: &'a mut DecodingContext<'a>,
	) -> ClgnDecodingResult<&[ChildTag]> {
		if !self._child_clgn.filled() {
			let abs_clgn_path = context.root_path().join(&self.clgn_path);
			let subroot = RootTag::from_dir(abs_clgn_path)?;
			println!("{:?}", subroot);

			context.push_scope(DecodingScope {
				root_path: abs_clgn_path.as_ref(),
				vars: &EMPTY_VARS,
			});

			self._child_clgn.fill(subroot).ok();
		}

		let children = self._child_clgn.borrow().unwrap().children(context);
		return children;
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTagExtras<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(default)]
	children: Option<Vec<ChildTag<'a>>>,
}

impl OtherTagExtras<'_> {
	fn children(&self) -> &[ChildTag] {
		match &self.children {
			Some(c) => c,
			None => &[],
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum ChildTagExtras<'a> {
	Image(ImageTagExtras<'a>),
	Container(ContainerTagExtras),
	Other(OtherTagExtras<'a>),
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ChildTag<'a> {
	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs<'a>>,

	#[serde(default)]
	text: Option<String>,

	#[serde(flatten)]
	tag_specific_extras: ChildTagExtras<'a>,
}

impl TagLike for ChildTag<'_> {
	fn tag_name(&self) -> &str {
		use ChildTagExtras::*;

		match &self.tag_specific_extras {
			Image(_) => "image",
			Container(_) => "g",
			Other(t) => &t.tag_name,
		}
	}

	fn vars(&self, _: &DecodingContext) -> &Option<TagVariables> {
		&self.vars
	}

	fn attrs<'a>(&'a self, context: &DecodingContext) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		use ChildTagExtras::*;

		let orig_attrs = match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		};

		let mut attrs = raw_attrs_map_to_subd_attrs_vec(orig_attrs, context)?;

		// If more cases arise, convert this to a match
		if let Image(t) = &self.tag_specific_extras {
			attrs.push(t.get_image_attr_pair(context)?)
		}

		Ok(attrs)
	}

	fn children<'a>(
		&'a self,
		context: &'a mut DecodingContext<'a>,
	) -> ClgnDecodingResult<&[ChildTag]> {
		use ChildTagExtras::*;

		match &self.tag_specific_extras {
			Container(t) => t.children(context),
			Image(t) => Ok(t.children()),
			Other(t) => Ok(t.children()),
		}
	}

	fn text<'a>(&'a self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
		match &self.text {
			None => Ok(Cow::Borrowed("")),
			Some(s) => Ok(Cow::Owned(do_variable_substitution(s.as_ref(), context)?)),
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct RootTag<'a> {
	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs<'a>>,

	#[serde(default)]
	children: Option<Vec<ChildTag<'a>>>,

	#[serde(default)]
	text: Option<String>,
}

impl<'a> TagLike for RootTag<'a> {
	fn tag_name(&self) -> &str {
		"svg"
	}

	fn vars(&self, _: &DecodingContext) -> &Option<TagVariables> {
		&self.vars
	}

	fn attrs(&'a self, context: &DecodingContext) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let orig_attrs = match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		};

		let mut attrs = raw_attrs_map_to_subd_attrs_vec(orig_attrs, context)?;

		if !orig_attrs.0.contains_key("xmlns") {
			attrs.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(attrs)
	}

	fn text(&'a self, context: &'a DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
		match &self.text {
			None => Ok(Cow::Borrowed("")),
			Some(s) => Ok(do_variable_substitution(s.as_ref(), context)?),
		}
	}

	fn children(&self, _: &mut DecodingContext) -> ClgnDecodingResult<&[ChildTag]> {
		Ok(match &self.children {
			Some(children) => children,
			None => &[],
		})
	}
}
