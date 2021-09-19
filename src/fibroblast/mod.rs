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
use std::borrow::Cow;

use std::collections::BTreeMap as Map; // https://users.rust-lang.org/t/hashmap-vs-btreemap/13804/3
use std::path::PathBuf;

use crate::to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult};
use parse_vars::do_variable_substitution;

lazy_static! {
	/// The `BTreeMap` equivalent of `&[]`, which sadly only exists for `Vec`. Since
	/// `BTreeMap` doesn't allocate until it has at least one element, this really costs
	/// almost nothing
	pub(crate) static ref EMPTY_ATTRS: XmlAttrs = XmlAttrs(Map::new());
	pub(crate) static ref EMPTY_VARS: TagVariables = TagVariables(Map::new());
}

#[derive(Serialize, Deserialize, Debug)]
struct CommonTagFields<'a> {
	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,

	#[serde(default)]
	children: Option<Vec<AnyChildTag<'a>>>,

	#[serde(default)]
	text: Option<String>,
}

impl<'a> CommonTagFields<'a> {
	fn base_vars(&self) -> &TagVariables {
		match &self.vars {
			None => &EMPTY_VARS,
			Some(vars) => vars,
		}
	}

	fn base_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		}
	}

	fn base_children(&self) -> &[AnyChildTag<'a>] {
		match &self.children {
			None => &[],
			Some(children) => children,
		}
	}

	fn base_text(&self) -> &str {
		match &self.text {
			None => "",
			Some(t) => t.as_ref(),
		}
	}
}

fn get_subd_text<'a>(text: &'a str, context: &DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
	let subd_text = do_variable_substitution(text, context)?;
	match subd_text {
		None => Ok(Cow::Borrowed(text)),
		Some(subd_text) => Ok(Cow::Owned(subd_text)),
	}
}

/// By default, getting the attrs as a list of pairs is just iterating over the
/// underlying Map, mapping wrapping in a Cow, and collecting into a Vec
fn raw_attrs_map_to_subd_attrs_vec<'a>(
	map: &'a XmlAttrs,
	context: &DecodingContext,
) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
	let mut attrs = Vec::with_capacity(map.0.len());

	for (k, v) in map.0.iter() {
		let attr_val = if let SimpleValue::Text(s) = v {
			let var_value = do_variable_substitution(s, context)?;
			if let Some(subd_text) = var_value {
				Cow::Owned(SimpleValue::Text(subd_text))
			} else {
				Cow::Borrowed(v)
			}
		} else {
			Cow::Borrowed(v)
		};

		attrs.push((k.as_ref(), attr_val));
	}

	Ok(attrs)
}

fn raw_attrs_vec_to_subd_attrs_vec<'a>(
	vec: AttrKVValueVec<'a>,
	context: &DecodingContext,
) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
	let mut attrs = Vec::with_capacity(vec.len());

	for (k, v) in vec {
		let attr_val = if let SimpleValue::Text(s) = v.as_ref() {
			let var_value = do_variable_substitution(s, context)?;
			if let Some(subd_text) = var_value {
				Cow::Owned(SimpleValue::Text(subd_text)) as Cow<SimpleValue>
			} else {
				v
			}
		} else {
			v
		};

		attrs.push((k, attr_val));
	}

	Ok(attrs)
}

/// A tag for handling images. We handle images specially (that's the whole point), so
/// we need a separate type for their tags.
#[derive(Serialize, Deserialize, Debug)]
pub struct ImageTag<'a> {
	/// The path to the image relative to the folder root
	image_path: String,

	/// The image "kind" (usually synonymous with file extension). If `None`, will be
	/// set to the file extension of `image_path`
	#[serde(default)]
	kind: Option<String>,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> ImageTag<'a> {
	/// The kind of the image (e.g., `"jpg"`, `"png"`). If `self.kind.is_none()`, the
	/// `kind` will be inferred from the file extension of `image_path`. A file
	/// extension's case is ignored.
	pub(crate) fn kind(&'a self) -> Option<Cow<'a, str>> {
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
		let abs_image_path = context.get_root().join(&self.image_path);
		let b64_string = base64::encode(std::fs::read(abs_image_path)?);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		Ok((key, Cow::Owned(SimpleValue::Text(src_str))))
	}

	fn tag_name(&self) -> &str {
		"image"
	}

	fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ContainerTag<'a> {
	clgn_path: String,

	#[serde(skip)]
	#[serde(default)]
	_child_clgn: LazyCell<Fibroblast<'a>>,
}

impl<'a> ContainerTag<'a> {
	/// If not filled, fill in this `ContainerTag` with the `Fibroblast` given by
	/// `self.clgn_path`. Always returns the contained `Fibroblast`
	fn initialize(&self, context: &DecodingContext<'a>) -> ClgnDecodingResult<&Fibroblast<'a>> {
		match self._child_clgn.borrow() {
			Some(fb) => Ok(fb),
			None => {
				let context = context.clone();
				let abs_clgn_path = context.get_root().join(&self.clgn_path);

				context.replace_root(&abs_clgn_path);

				let subroot = Fibroblast::from_dir_with_context(&abs_clgn_path, context)?;
				self._child_clgn.fill(subroot).unwrap();
				Ok(self._child_clgn.borrow().unwrap())
			}
		}
	}

	pub(crate) fn as_fibroblast(&self) -> &Fibroblast<'a> {
		self._child_clgn.borrow().unwrap()
	}

	// pub(crate) fn as_g_tag(
	// 	&'a self,
	// 	_: &DecodingContext<'a>,
	// ) -> ClgnDecodingResult<AnyChildTag<'a>> {
	// 	Ok(AnyChildTag::NestedRoot(NestedRootTag {
	// 		root: &self._child_clgn.borrow().unwrap().root,
	// 	}))
	// }
}

impl<'a> ContainerTag<'a> {
	fn tag_name(&self) -> &str {
		"g"
	}

	fn vars(&'a self) -> &TagVariables {
		self.as_fibroblast().vars()
	}

	fn attrs(&'a self) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		self.as_fibroblast().attrs()
	}

	fn children(&'a self) -> &[AnyChildTag<'a>] {
		self.as_fibroblast().children()
	}

	fn text(&'a self) -> ClgnDecodingResult<Cow<'a, str>> {
		self.as_fibroblast().text()
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTag<'a> {
	#[serde(rename = "tag")]
	tag_name: String,

	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> OtherTag<'a> {
	fn tag_name(&self) -> &str {
		self.tag_name.as_ref()
	}

	fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum AnyChildTag<'a> {
	Container(ContainerTag<'a>),
	Image(ImageTag<'a>),
	Other(OtherTag<'a>),
}

impl<'a> AnyChildTag<'a> {
	// This seems dumb. Any way to dedupe this?
	pub(crate) fn tag_name(&self) -> &str {
		use AnyChildTag::*;
		match &self {
			Container(t) => t.tag_name(),
			Image(t) => t.tag_name(),
			Other(t) => t.tag_name(),
		}
	}

	fn initialize(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<()> {
		let ok = Ok(());
		match &self {
			AnyChildTag::Container(t) => t.initialize(context).and(ok),
			_ => ok,
		}
	}

	pub(crate) fn vars(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&TagVariables> {
		self.initialize(context)?;

		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.vars(),
			Image(t) => t.base_vars(),
			Other(t) => t.base_vars(),
		})
	}

	pub(crate) fn attrs(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		self.initialize(context)?;

		use AnyChildTag::*;
		let mut attrs = match &self {
			Container(t) => raw_attrs_vec_to_subd_attrs_vec(t.attrs()?, context),
			Image(t) => raw_attrs_map_to_subd_attrs_vec(t.base_attrs(), context),
			Other(t) => raw_attrs_map_to_subd_attrs_vec(t.base_attrs(), context),
		}?;

		// If more cases arise, convert this to a match
		if let AnyChildTag::Image(t) = self {
			attrs.push(t.get_image_attr_pair(context)?);
		}

		Ok(attrs)
	}

	pub(crate) fn children(
		&'a self,
		context: &'a DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a [AnyChildTag]> {
		self.initialize(context)?;

		use AnyChildTag::*;
		Ok(match &self {
			Container(t) => t.children(),
			Image(t) => t.base_children(),
			Other(t) => t.base_children(),
		})
	}

	pub(crate) fn text(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, str>> {
		self.initialize(context)?;

		use AnyChildTag::*;
		match &self {
			Container(t) => t.text(),
			Image(t) => Ok(Cow::Borrowed(t.base_text())),
			Other(t) => Ok(Cow::Borrowed(t.base_text())),
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct RootTag<'a> {
	#[serde(flatten)]
	common_tag_fields: CommonTagFields<'a>,
}

impl<'a> RootTag<'a> {
	pub(crate) fn tag_name(&self) -> &str {
		"svg"
	}

	fn base_vars(&self) -> &TagVariables {
		self.common_tag_fields.base_vars()
	}

	fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	fn base_children(&self) -> &[AnyChildTag<'a>] {
		self.common_tag_fields.base_children()
	}

	fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(crate) fn vars(&self, _: &DecodingContext) -> &TagVariables {
		self.base_vars()
	}

	pub(crate) fn attrs(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let base_attrs = self.base_attrs();

		let mut new_attrs = raw_attrs_map_to_subd_attrs_vec(base_attrs, context)?;

		if !base_attrs.0.contains_key("xmlns") {
			new_attrs.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(new_attrs)
	}

	pub(crate) fn text(&'a self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'a, str>> {
		get_subd_text(self.base_text(), context)
	}

	pub(crate) fn children(&self) -> &[AnyChildTag<'a>] {
		self.base_children()
	}
}

#[derive(Debug)]
pub(crate) struct Fibroblast<'a> {
	pub(crate) root: RootTag<'a>,
	pub(crate) context: DecodingContext<'a>,
}

impl<'a> Fibroblast<'a> {
	pub(crate) fn attrs(&'a self) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		self.root.attrs(&self.context)
	}

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
