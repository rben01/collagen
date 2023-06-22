//! Contains the data types used for the in-memory representation of a `Fibroblast`.

use crate::utils::Map;
use serde::{de::Visitor, Deserialize, Serialize};
use std::borrow::Cow;

pub(crate) mod context;
pub use context::DecodingContext;

mod concrete_number;
pub(crate) use concrete_number::ConcreteNumber;

mod simple_value;
pub(crate) use simple_value::SimpleValue;

mod variable_value;
pub(crate) use variable_value::VariableValue;

/// A type alias for storing XML attribute key-value pairs
#[derive(Debug, Clone)]
pub(crate) struct XmlAttrs(pub(crate) Vec<(String, SimpleValue)>);

impl<'de> Deserialize<'de> for XmlAttrs {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: serde::Deserializer<'de>,
	{
		struct XmlAttrsVisitor;
		impl<'de> Visitor<'de> for XmlAttrsVisitor {
			type Value = XmlAttrs;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter
					.write_str("a Map<String, VariableValue> or a List<(String, VariableValue)>")
			}

			fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
			where
				A: serde::de::MapAccess<'de>,
			{
				let mut items = Vec::new();
				while let Some((k, v)) = map.next_entry()? {
					items.push((k, v))
				}

				Ok(XmlAttrs(items))
			}

			fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
			where
				A: serde::de::SeqAccess<'de>,
			{
				let mut items = Vec::new();
				while let Some((k, v)) = seq.next_element()? {
					items.push((k, v))
				}

				Ok(XmlAttrs(items))
			}
		}

		deserializer.deserialize_any(XmlAttrsVisitor)
	}
}

impl Serialize for XmlAttrs {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: serde::Serializer,
	{
		serializer.collect_map(self.0.iter().map(|(k, v)| (k, v)))
	}
}

type XmlAttrPairBorrowed<'a> = (&'a str, Cow<'a, SimpleValue>);

// impl XmlAttrs {
// 	pub(crate) fn iter(&self) -> impl Iterator<Item = XmlAttrPairBorrowed<'_>> {
// 		self.0.iter().map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
// 	}
// }

/// A vector of key, value pairs representing attributes
pub(crate) struct XmlAttrsBorrowed<'a>(pub(crate) Vec<XmlAttrPairBorrowed<'a>>);

/// Map of `String` -> `VariableValue`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct TagVariables(pub(crate) Map<String, VariableValue>);

pub(crate) fn insert_var(
	into: &mut Option<TagVariables>,
	key: String,
	value: VariableValue,
) -> Option<VariableValue> {
	match into {
		Some(vars) => vars.0.insert(key, value),
		None => {
			*into = Some(TagVariables(Map::from_iter([(key, value)])));
			None
		}
	}
}
