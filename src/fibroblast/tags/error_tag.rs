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
		&[$($keys,)* "vars", "attrs", "children", "text", "should_escape_text"]
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
			OtherTag => append_common_tag_fields!(),
			ForeachTag => &["vars", "attrs"],
			IfTag => &["else", "vars", "attrs"],
			ContainerTag => &[],
			ImageTag => append_common_tag_fields!("kind"),
			NestedSvgTag => &[],
			FontTag => &["vars", "attrs"],
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
						"Based on the presence of the `{key}` key, it looks \
						 like this was meant to be {a} `{name}`. "
					)?;

					if required_keys.len() > 0 {
						write!(
							f,
							"In addition to {key:?}, the required keys for {a} `{name}` \
							 are {required_keys:?}. "
						)?;
					} else {
						write!(f, "The `{name}` has no other required keys. ")?;
					}

					if optional_keys.len() > 0 {
						write!(
							f,
							"The `{name}` supports the following optional keys: {optional_keys:?}. "
						)?;
					}

					let forbidden_keys = o
						.keys()
						.filter(|k| {
							let k = k.as_str();
							!(k == key || required_keys.contains(&k) || optional_keys.contains(&k))
						})
						.collect::<Vec<_>>();

					if forbidden_keys.len() > 0 {
						write!(
							f,
							"The `{name}` supports no other keys, and the following \
							 unexpected keys were encountered: {forbidden_keys:?}."
						)?;
					}

					write!(
						f,
						"If you provided the right set of keys, \
						 check that everything was of the right type."
					)?;
				} else {
					if known_tags_ids_seen.len() >= 2 {
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
					}
				}
				write!(
					f,
					"For an in-depth description of the schema, visit \
					 https://docs.rs/collagen/{}/\
					 collagen/fibroblast/tags/enum.AnyChildTag.html",
					env!("CARGO_PKG_VERSION")
				)?;

				Ok(())
			}
		}
	}
}
