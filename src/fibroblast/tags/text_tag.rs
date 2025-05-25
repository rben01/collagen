use super::{any_child_tag::AnyChildTagDiscriminants, DecodingContext, Extras, Validatable};
use crate::{
	from_json::{decoding_error::InvalidSchemaErrorList, ClgnDecodingError},
	to_svg::svg_writable::SvgWritable,
	ClgnDecodingResult,
};
use compact_str::{CompactString, ToCompactString};
use quick_xml::events::BytesText;
use serde::{de, Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct TextTag {
	#[serde(flatten)]
	inner: Inner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	text: CompactString,

	#[serde(default, skip_serializing_if = "Option::is_none")]
	is_preescaped: Option<bool>,
}

impl SvgWritable for TextTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		_context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		let Self {
			inner: Inner {
				text,
				is_preescaped,
			},
		} = self;

		let bt = if is_preescaped == &Some(true) {
			BytesText::from_escaped(text)
		} else {
			BytesText::new(text.as_ref())
		};

		writer
			.write_event(crate::XmlEvent::Text(bt))
			.map_err(|error| ClgnDecodingError::Xml(error.into()))?;

		Ok(())
	}
}

#[derive(Debug, Serialize)]
pub(crate) struct UnvalidatedTextTag {
	#[serde(flatten)]
	inner: Inner,

	#[serde(flatten)]
	extras: Extras,
}

impl<'de> de::Deserialize<'de> for UnvalidatedTextTag {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: serde::Deserializer<'de>,
	{
		struct UnvalidatedTextTagVisitor;

		impl<'v> de::Visitor<'v> for UnvalidatedTextTagVisitor {
			type Value = UnvalidatedTextTag;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("either a string, or an object fitting the TextTag schema")
			}

			fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
			where
				E: de::Error,
			{
				Ok(UnvalidatedTextTag {
					inner: Inner {
						text: v.to_compact_string(),
						is_preescaped: None,
					},
					extras: Extras(serde_json::Map::new()),
				})
			}

			fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
			where
				A: de::MapAccess<'v>,
			{
				let mut text = None;
				let mut is_preescaped = None;
				let mut extras = serde_json::Map::new();

				while let Some(key) = map.next_key()? {
					match key {
						"text" => {
							if text.is_some() {
								return Err(de::Error::duplicate_field("text"));
							}
							text = Some(map.next_value()?);
						}
						"is_preescaped" => {
							if is_preescaped.is_some() {
								return Err(de::Error::duplicate_field("is_preescaped"));
							}
							is_preescaped = Some(map.next_value()?);
						}
						_ => {
							extras.insert(key.to_owned(), map.next_value()?);
						}
					}
				}

				let text = text.ok_or_else(|| de::Error::missing_field("text"))?;

				Ok(UnvalidatedTextTag {
					inner: Inner {
						text,
						is_preescaped,
					},
					extras: Extras(extras),
				})
			}
		}

		deserializer.deserialize_any(UnvalidatedTextTagVisitor)
	}
}

impl Validatable for UnvalidatedTextTag {
	type Validated = TextTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner {
				text,
				is_preescaped,
			},
			extras,
		} = self;

		if let Err(e) = extras.ensure_empty(AnyChildTagDiscriminants::Text.name()) {
			errors.push(e);
		}

		if errors.is_empty() {
			Ok(TextTag {
				inner: Inner {
					text,
					is_preescaped,
				},
			})
		} else {
			Err(())
		}
	}
}
