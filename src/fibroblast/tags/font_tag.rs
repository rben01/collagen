use super::{
	any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeXmlAttrs, DecodingContext,
	Extras,
};
use crate::{
	from_json::decoding_error::InvalidSchemaErrorList,
	to_svg::svg_writable::{write_tag, ClgnDecodingError, SvgWritable},
	utils::{b64_encode, Map},
	ClgnDecodingResult,
};
use compact_str::{format_compact, CompactString, ToCompactString};
use quick_xml::events::{BytesText, Event};
use serde::{de, ser::SerializeMap, Deserialize, Serialize};

#[cfg(feature = "_any_bundled_font")]
use crate::assets::fonts;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub(crate) enum FontAttr {
	String(CompactString),
	Number(serde_json::Number),
}

enum CowishFontAttr<'a> {
	OwnedAttr(FontAttr),
	BorrowedAttr(&'a FontAttr),
	BorrowedStr(&'a str),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct UserProvidedFontFace {
	name: CompactString,
	path: CompactString,

	#[serde(default)]
	attrs: Map<CompactString, FontAttr>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct BundledFontFace {
	name: CompactString,

	#[serde(default)]
	attrs: Map<CompactString, FontAttr>,
}

#[derive(Debug, Clone)]
pub(crate) enum FontFace {
	UserProvided(UserProvidedFontFace),
	#[cfg_attr(not(feature = "_any_bundled_font"), allow(dead_code))]
	Bundled(BundledFontFace),
}

impl FontFace {
	const fn n_entries(&self) -> usize {
		use FontFace::*;
		match self {
			UserProvided(_) => 4,
			Bundled(_) => 3,
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
				map.serialize_entry("name", name)?;
				map.serialize_entry("attrs", attrs)?;
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
				let attrs = attrs.unwrap_or_default();

				let ff = if bundled {
					if path.is_some() {
						return Err(de::Error::custom("You specified both `bundled = true` and a `path` for your font. These are mutually exclusive options."));
					}
					FontFace::Bundled(BundledFontFace { name, attrs })
				} else {
					let path = path.ok_or_else(|| de::Error::missing_field("path"))?;
					FontFace::UserProvided(UserProvidedFontFace { name, path, attrs })
				};

				Ok(ff)
			}
		}

		deserializer.deserialize_map(FontFaceVisitor)
	}
}

/// A tag for embedding woff2 font files within SVGs. (This is not widely supported by
/// SVG viewers, but Collagen supports it nonetheless.) Fonts are specified either as a
/// path to the woff2 file on disk, or are specified as one of the handful of fonts that
/// come bundled with the `clgn` executable (assuming the executable was built with said
/// font bundled).
///
/// In the resuling SVG, fonts are included in a `<style>` tag with a `@font-face {}`
/// section. Multiple fonts in the same `FontTag` will reside in the same `<style>` tag
/// (which should not affect anything).
///
/// # Properties
///
/// - `fonts`
///   - Type: list of `FontFace` (documented below)
///   - Required: Yes.
///   - Description: The list of `FontFace`s to embed in the SVG. An example is `[{
///     name: "MyFont", path: "path/to/my_font.woff2" }]`
/// - Other: `FontTag` accepts just the `vars` and `attrs` fields as documented in
///   [`CommonTagFields`](super::CommonTagFields). No other fields in
///   [`CommonTagFields`](super::CommonTagFields) are accepted.
///
/// # `FontFace`
///
/// As stated above there are two kinds of `FontFace`, which are 1. the kind that exists
/// on disk and 2. the kind that is embedded in the `clgn` executable. Both kinds
/// require a `"name"`, which is used as the `font-family` in CSS, and optionally
/// support `attrs`, which will be used as other attributes inside the `@font-face`
/// declaration. For example, an `attrs` of `{ "font-style": "italic", "font-weight":
/// "bold" }` will insert `font-style:italic;font-weight:bold;` in the `@font-face`
/// declaration.
///
/// In addition, both kinds support the option boolean `bundled` property, which is a
/// boolean that tells `clgn` whether the font is bundled in the executable or not. If
/// missing, it is treated as if it were `false`. The first kind of `FontFace`, the kind
/// that exists on disk, also has a `path` field of type string to specify where the
/// `woff2` exists (so that it may be embedded). So, in summary,
///
/// ## Properties
///
/// - `name`
///   - Type: string
///   - Required: Yes.
///   - Description: The name of the font, which is used in `font-family: ...` in the
///     `<style>` tag. If `bundled` is `true` then this name must match the name of one
///     of the fonts embedded in `clgn`.
/// - `bundled`
///   - Type: boolean
///   - Required: No. Missing is equivalent to `false`.
///   - Description: Informs `clgn` whether this font is bundled with the executable or
///     will be provided via path to the woff2 file on disk. `true` means the font's
///     `name` must be the name that `clgn` calls its bundled font.
/// - `path`
///   - Type: string
///   - Required: Yes if `bundled` is `false`. Must be absent if `bundled` is `true`.
///   - Description: The path to the font to be embedded, relative to the skeleton root.
///     May not be specified in conjunction with `"bundled": true`, as these contradict
///     each other. It is an error if no file exists at the specified path.
/// - `attrs`
///   - Type: object whose values are string
///   - Required: No. Missing is equivalent to `{}`.
///   - Description: Key-value pairs that will be inserted into the `@font-face`
///     declaration, e.g., `{ "font-weight": 100 }` becomes `font-weight: 100;`
///
/// # Example
///
/// Putting it all together, here is a valid `FontTag`:
///
/// ```json
/// {
///   "fonts": [
///     { "name": "Impact", "bundled": true },
///     { "name": "MyThinFont", "path": "path/to/font.woff2", "attrs": { "font-weight": 100 } }
///   ],
///   "vars": { "foo": "bar" }
/// }
/// ```
#[derive(Debug, Clone, Serialize)]
pub struct FontTag {
	#[serde(flatten)]
	inner: Inner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	fonts: Vec<FontFace>,
	attrs: DeXmlAttrs,
}

impl FontTag {
	fn get_font_path_attr_pair(
		path: impl AsRef<str>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<CompactString> {
		let path = path.as_ref();
		let abs_font_path = context.canonicalize(path)?;

		let b64_string = b64_encode(std::fs::read(abs_font_path.as_path()).map_err(|source| {
			ClgnDecodingError::IoRead {
				source,
				path: abs_font_path,
			}
		})?);
		let src_str = format_compact!(
			"url('data:font/woff2;charset=utf-8;base64,{b64_string}') format('woff2')"
		);

		Ok(src_str)
	}

	fn font_embed_text(&self, context: &DecodingContext) -> ClgnDecodingResult<String> {
		let mut text = String::from("<style>");
		for font in &self.inner.fonts {
			let (mut all_attrs, self_attrs) = match font {
				#[cfg_attr(
					not(feature = "_any_bundled_font"),
					allow(unused_variables, unreachable_code, unused_mut)
				)]
				FontFace::Bundled(font) => {
					let BundledFontFace {
						name: font_family,
						attrs: self_attrs,
					} = font;

					let mut all_attrs =
						vec![("font-family", CowishFontAttr::BorrowedStr(font_family))];

					match font_family.to_ascii_uppercase().as_str() {
						#[cfg(feature = "font_impact")]
						"IMPACT" => all_attrs
							.push(("src", CowishFontAttr::BorrowedStr(fonts::IMPACT_WOFF2_B64))),

						_ => {
							return Err(ClgnDecodingError::BundledFontNotFound {
								font_name: font_family.to_string(),
							})
						}
					}

					(all_attrs, self_attrs)
				}
				FontFace::UserProvided(font) => {
					let UserProvidedFontFace {
						name: font_family,
						path,
						attrs: self_attrs,
					} = font;

					let mut all_attrs =
						vec![("font-family", CowishFontAttr::BorrowedStr(font_family))];
					let b64_font = Self::get_font_path_attr_pair(path, context)?;

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
				text.push_str(k);
				text.push(':');

				match &v {
					CowishFontAttr::OwnedAttr(a) => match a {
						FontAttr::String(s) => text.push_str(s),
						FontAttr::Number(n) => text.push_str(&n.to_compact_string()),
					},
					CowishFontAttr::BorrowedAttr(a) => match *a {
						FontAttr::String(s) => text.push_str(s),
						FontAttr::Number(n) => text.push_str(&n.to_compact_string()),
					},
					CowishFontAttr::BorrowedStr(s) => text.push_str(s),
				};

				text.push(';');
			}

			text.push('}');
		}

		text.push_str("</style>");

		Ok(text)
	}
}

impl SvgWritable for FontTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		write_tag(writer, "defs", self.inner.attrs.as_ref(), |writer| {
			writer
				.write_event(Event::Text(BytesText::from_escaped(
					self.font_embed_text(context)?,
				)))
				.map_err(|error| ClgnDecodingError::Xml(error.into()))?;
			Ok(())
		})
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UnvalidatedFontTag {
	#[serde(flatten)]
	inner: Inner,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedFontTag {
	type Validated = FontTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner { fonts, attrs },
			extras,
		} = self;

		if let Err(e) = extras.ensure_empty(AnyChildTagDiscriminants::Font.name()) {
			errors.push(e);
		}

		if errors.is_empty() {
			Ok(FontTag {
				inner: Inner { fonts, attrs },
			})
		} else {
			Err(())
		}
	}
}
