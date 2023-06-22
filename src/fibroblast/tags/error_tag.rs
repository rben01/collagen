use crate::ClgnDecodingResult;
use serde::{Deserialize, Serialize};
use std::fmt;
use strum::IntoEnumIterator;
use strum_macros::{AsRefStr, EnumIter};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ErrorTag {
	#[serde(flatten)]
	pub(crate) json: serde_json::Value,
}

#[derive(Debug)]
pub enum ErrorTagReason {
	/// A non-object type was passed where an object was expected
	///
	/// While this technically can store a `serde_json::Value::Object`, it never will
	InvalidType(serde_json::Value),
	/// An object not matching any known schema was passed
	InvalidObject(serde_json::Map<String, serde_json::Value>),
}

macro_rules! append_common_tag_fields {
	 ($($keys:expr),* $(,)?) => {
		&[$($keys,)* "vars", "attrs"]
	 };
}

#[derive(Clone, Copy, Debug, AsRefStr, EnumIter)]
enum KnownTag {
	OtherTag,
	ForeachTag,
	IfTag,
	ContainerTag,
	ImageTag,
	NestedSvgTag,
	FontTag,
}

impl KnownTag {
	fn primary_key(self) -> &'static str {
		use KnownTag::*;
		match self {
			OtherTag => "tag",
			ForeachTag => "for_each",
			IfTag => "if",
			ContainerTag => "clgn_path",
			ImageTag => "image_path",
			NestedSvgTag => "svg_path",
			FontTag => "fonts",
		}
	}

	fn name(&self) -> &str {
		self.as_ref()
	}

	fn article(self) -> &'static str {
		use KnownTag::*;
		match self {
			OtherTag | IfTag | ImageTag => "an",
			ForeachTag | ContainerTag | NestedSvgTag | FontTag => "a",
		}
	}

	fn required_keys(self) -> &'static [&'static str] {
		use KnownTag::*;
		match self {
			OtherTag => &[],
			ForeachTag => &["do"],
			IfTag => &["then"],
			ContainerTag => &[],
			ImageTag => &[],
			NestedSvgTag => &[],
			FontTag => &[],
		}
	}

	fn optional_keys(self) -> &'static [&'static str] {
		use KnownTag::*;
		match self {
			OtherTag => append_common_tag_fields!("children"),
			ForeachTag => append_common_tag_fields!(),
			IfTag => append_common_tag_fields!("else"),
			ContainerTag => &[],
			ImageTag => append_common_tag_fields!("kind", "children"),
			NestedSvgTag => &[],
			FontTag => append_common_tag_fields!(),
		}
	}
}

impl fmt::Display for ErrorTagReason {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			ErrorTagReason::InvalidType(v) => {
				write!(f, "Each tag must be an object; got: {:?}", v)
			}
			ErrorTagReason::InvalidObject(o) => {
				write!(
					f,
					"The following object did not match any known schema: {}\n",
					serde_json::to_string(&o).unwrap()
				)?;

				let known_tags_ids_seen = KnownTag::iter()
					.filter(|k| o.contains_key(k.primary_key()))
					.collect::<Vec<_>>();

				if known_tags_ids_seen.len() == 1 {
					let kt = known_tags_ids_seen[0];
					let key = kt.primary_key();
					let name = kt.name();
					let required_keys = kt.required_keys();
					let optional_keys = kt.optional_keys();
					let a = kt.article();

					write!(
						f,
						"The presence of key {key:?} implies that this is {a} `{name}`. "
					)?;

					let unexpected_keys = o
						.keys()
						.filter(|k| {
							let k = k.as_str();
							!(k == key || required_keys.contains(&k) || optional_keys.contains(&k))
						})
						.collect::<Vec<_>>();

					let missing_keys = required_keys
						.iter()
						.copied()
						.filter(|&k| !o.contains_key(k))
						.collect::<Vec<_>>();
					if unexpected_keys.is_empty() && missing_keys.is_empty() {
						write!(
							f,
							"Since you provided all of the other required keys, \
							 {required_keys:?}, check that the values were all of \
							 the right type. "
						)?;
					} else {
						if !missing_keys.is_empty() {
							write!(
								f,
								"In addition to {key:?}, keys {required_keys:?} \
								 are required, but keys {missing_keys:?} were missing. "
							)?;
						} else {
							write!(f, "`{name}` has no other required keys. ")?;
						}

						if !unexpected_keys.is_empty() {
							write!(
								f,
								"The only other permitted keys for `{name}` are {optional_keys:?}, \
								 but keys {unexpected_keys:?} were passed. "
							)?;
						}
					}
				} else if known_tags_ids_seen.len() >= 2 {
					write!(
						f,
						"Could not infer the tag's type because multiple matching \
						 primary keys were found: {:?}. At most one \
						 may be provided. ",
						known_tags_ids_seen
							.iter()
							.map(|kt| kt.primary_key())
							.collect::<Vec<_>>()
					)?;
				} else {
					write!(
						f,
						"Could not infer the tag's type because no \
						 recognized primary key was found. All tags must have \
						 exactly one of the following keys: {:?}. ",
						KnownTag::iter()
							.map(|kt| kt.primary_key())
							.collect::<Vec<_>>()
					)?;
				}
				write!(
					f,
					"\nFor an in-depth description of the schema, visit \
					 https://docs.rs/collagen/{}/\
					 collagen/fibroblast/tags/enum.AnyChildTag.html",
					env!("CARGO_PKG_VERSION")
				)?;

				Ok(())
			}
		}
	}
}

pub(crate) trait Validatable {
	fn validate(self) -> ClgnDecodingResult<Self>
	where
		Self: Sized;
}

#[macro_export]
macro_rules! impl_trivially_validatable {
	($ty:ty) => {
		impl $crate::fibroblast::tags::error_tag::Validatable for $ty {
			fn validate(self) -> $crate::ClgnDecodingResult<Self>
			where
				Self: Sized,
			{
				Ok(self)
			}
		}
	};
}

#[macro_export]
macro_rules! impl_validatable_via_children {
	($ty:ty) => {
		impl $crate::fibroblast::tags::error_tag::Validatable for $ty {
			fn validate(mut self) -> $crate::ClgnDecodingResult<Self>
			where
				Self: Sized,
			{
				self.children.children = self
					.children
					.children // Option<Vec<T>>
					.map(|c| {
						c.into_iter()
							.map(|child| child.validate())
							.collect::<$crate::ClgnDecodingResult<Vec<_>>>()
					}) // Option<Result<Vec<T>, E>>
					.transpose()?;
				Ok(self)
			}
		}
	};
}
