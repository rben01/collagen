use super::{AnyChildTag, DecodingContext, TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};
use crate::{
	fibroblast::data_types::{ConcreteNumber, Map},
	to_svg::svg_writable::ClgnDecodingError,
	ClgnDecodingResult,
};
use serde::{de, ser::SerializeMap, Deserialize, Serialize};
use std::borrow::Cow;

#[cfg(feature = "_any_bundled_font")]
use crate::assets::fonts;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub(crate) enum FontAttr {
	String(String),
	Number(ConcreteNumber),
}

enum CowishFontAttr<'a> {
	OwnedAttr(FontAttr),
	BorrowedAttr(&'a FontAttr),
	BorrowedStr(&'a str),
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct UserProvidedFontFace {
	name: String,
	path: String,

	#[serde(default)]
	attrs: Map<String, FontAttr>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct BundledFontFace {
	name: String,

	#[serde(default)]
	attrs: Map<String, FontAttr>,
}

#[derive(Debug)]
pub(crate) enum FontFace {
	UserProvided(UserProvidedFontFace),
	#[cfg_attr(not(feature = "_any_bundled_font"), allow(dead_code))]
	Bundled(BundledFontFace),
}

impl FontFace {
	const fn n_entries(&self) -> usize {
		use FontFace::*;
		match self {
			UserProvided(_) => 3,
			Bundled(_) => 2,
		}
	}
}

impl Serialize for FontFace {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: serde::Serializer,
	{
		use FontFace::*;
		let mut map = serializer.serialize_map(Some(self.n_entries()))?;

		match self {
			UserProvided(font) => {
				let UserProvidedFontFace { name, path, attrs } = font;

				map.serialize_entry("bundled", &false)?;
				map.serialize_entry("name", name)?;
				map.serialize_entry("path", path)?;
				map.serialize_entry("attrs", attrs)?;
			}
			Bundled(font) => {
				let BundledFontFace { name, attrs } = font;

				map.serialize_entry("bundled", &true)?;
				map.serialize_entry("name", &name)?;
				map.serialize_entry("attrs", &attrs)?;
			}
		}
		map.end()
	}
}

impl<'de> Deserialize<'de> for FontFace {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: serde::Deserializer<'de>,
	{
		#[derive(Deserialize, Debug)]
		#[serde(field_identifier, rename_all = "lowercase")]
		enum Field {
			Bundled,
			Name,
			Path,
			Attrs,
		}

		struct FontFaceVisitor;

		impl<'de> de::Visitor<'de> for FontFaceVisitor {
			type Value = FontFace;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("a font-face")
			}

			fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
			where
				A: serde::de::MapAccess<'de>,
			{
				macro_rules! handle_key {
					($map:ident, $key_var:ident, $key_val:expr $(,)?) => {{
						if ($key_var).is_some() {
							return Err(de::Error::duplicate_field($key_val));
						}
						$key_var = Some($map.next_value()?);
					}};
				}

				let mut bundled = None;
				let mut name = None;
				let mut path = None;
				let mut attrs = None;

				while let Some(key) = map.next_key()? {
					match key {
						Field::Bundled => handle_key!(map, bundled, "bundled"),
						Field::Name => handle_key!(map, name, "name"),
						Field::Path => handle_key!(map, path, "path"),
						Field::Attrs => handle_key!(map, attrs, "attrs"),
					}
				}

				let bundled = bundled.unwrap_or(false);
				let name = name.ok_or_else(|| de::Error::missing_field("name"))?;
				let attrs = attrs.unwrap_or_else(Map::new);

				let ff = match bundled {
					true => FontFace::Bundled(BundledFontFace { name, attrs }),
					false => {
						let path = path.ok_or_else(|| de::Error::missing_field("path"))?;
						FontFace::UserProvided(UserProvidedFontFace { name, path, attrs })
					}
				};

				Ok(ff)
			}
		}

		deserializer.deserialize_map(FontFaceVisitor)
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct FontTag {
	fonts: Vec<FontFace>,

	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,
}

impl FontTag {
	pub(super) fn tag_name(&self) -> &str {
		"defs"
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		match &self.vars {
			None => &EMPTY_VARS,
			Some(vars) => vars,
		}
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		}
	}

	pub(super) fn base_children<'a>(&self) -> &[AnyChildTag<'a>] {
		&[]
	}

	pub(super) fn get_font_path_attr_pair<S: AsRef<str>>(
		&self,
		path: S,
		context: &DecodingContext,
	) -> ClgnDecodingResult<String> {
		let path = path.as_ref();
		let abs_font_path = context.get_root().join(path);
		let b64_string = base64::encode(std::fs::read(abs_font_path)?);
		let src_str = format!(
			"url('data:font/woff2;charset=utf-8;base64,{}') format('woff2')",
			b64_string
		);

		Ok(src_str)
	}

	pub(super) fn font_embed_text(&self, context: &DecodingContext) -> ClgnDecodingResult<String> {
		let mut text = String::from("<style>");
		for font in &self.fonts {
			let (mut all_attrs, self_attrs) = match font {
				#[cfg_attr(not(feature = "_any_bundled_font"), allow(unused_variables))]
				FontFace::Bundled(font) => {
					#[cfg(not(feature = "_any_bundled_font"))]
					return Err(ClgnDecodingError::BuiltWithoutBundledFonts);

					#[cfg(feature = "_any_bundled_font")]
					{
						let BundledFontFace {
							name: font_family,
							attrs: self_attrs,
						} = font;

						let mut all_attrs =
							vec![("font-family", CowishFontAttr::BorrowedStr(font_family))];

						match font_family.to_ascii_uppercase().as_str() {
							#[cfg(feature = "font_impact")]
							"IMPACT" => all_attrs.push((
								"src",
								CowishFontAttr::BorrowedStr(fonts::IMPACT_WOFF2_B64),
							)),

							_ => {
								return Err(ClgnDecodingError::BundledFontNotFound(
									font_family.to_owned(),
								))
							}
						}

						(all_attrs, self_attrs)
					}
				}
				FontFace::UserProvided(font) => {
					let UserProvidedFontFace {
						name: font_family,
						path,
						attrs: self_attrs,
					} = font;

					let mut all_attrs =
						vec![("font-family", CowishFontAttr::BorrowedStr(font_family))];
					let b64_font = self.get_font_path_attr_pair(path, context)?;

					all_attrs.push(("src", CowishFontAttr::OwnedAttr(FontAttr::String(b64_font))));

					(all_attrs, self_attrs)
				}
			};

			all_attrs.extend(
				self_attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), CowishFontAttr::BorrowedAttr(v))),
			);

			text.push_str("@font-face{");

			for (k, v) in all_attrs {
				let new_val = match &v {
					CowishFontAttr::OwnedAttr(a) => match a {
						FontAttr::String(text) => context.sub_vars_into_str(text.as_ref())?,
						FontAttr::Number(n) => Cow::Owned(n.to_string()),
					},
					CowishFontAttr::BorrowedAttr(a) => match *a {
						FontAttr::String(text) => context.sub_vars_into_str(text.as_ref())?,
						FontAttr::Number(n) => Cow::Owned(n.to_string()),
					},
					CowishFontAttr::BorrowedStr(text) => context.sub_vars_into_str(text)?,
				};

				text.push_str(k);
				text.push(':');
				text.push_str(&new_val);
				text.push(';');
			}

			text.push('}');
		}

		text.push_str("</style>");

		Ok(text)
	}

	pub(super) fn should_escape_text(&self) -> bool {
		false
	}
}
