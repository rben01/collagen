use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use std::borrow::Cow;

use super::concrete_number::{ConcreteNumber, ConcreteNumberVisitor};

/// An enum whose variants represent "simple" (indivisible) values
#[derive(Debug)]
pub(crate) enum SimpleValue {
	Number(ConcreteNumber),
	Text(String),
	/// The presence of an attribute — usually represented `attr=""`
	Present,
	/// The absence of an attribute. How is this different from just ommitting the
	/// attribute altogether? Having an explicit option to drop attribtues may come in
	/// handy if we end up wanting to explicitly opt out of an attribute
	Absent,
}

impl SimpleValue {
	/// If anything other than `Absent`, return a stringified verion wrapped in a
	/// `Some`. If `Absent` then `None`.
	pub fn to_maybe_string(&self) -> Option<Cow<'_, str>> {
		use SimpleValue::*;

		match self {
			Number(n) => Some(Cow::Owned(n.to_string())),
			Text(s) => Some(Cow::Borrowed(s.as_ref())),
			Present => Some(Cow::Borrowed("")),
			Absent => None,
		}
	}
}

impl Clone for SimpleValue {
	/// Everything but `Text` is `Copy`; `Text` needs to be cloned
	fn clone(&self) -> Self {
		use SimpleValue::*;

		match self {
			Text(s) => Text(s.clone()),
			Number(x) => Number(*x),
			Present => Present,
			Absent => Absent,
		}
	}
}

impl Serialize for SimpleValue {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		use self::ConcreteNumber::*;
		use self::SimpleValue::*;

		match self {
			Number(Int(x)) => serializer.serialize_i64(*x),
			Number(UInt(x)) => serializer.serialize_u64(*x),
			Number(Float(x)) => serializer.serialize_f64(*x),
			Text(s) => serializer.serialize_str(s),
			Present => serializer.serialize_bool(true),
			Absent => serializer.serialize_bool(false),
		}
	}
}

impl<'de> Deserialize<'de> for SimpleValue {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		struct SimpleValueVisitor;

		impl<'de> de::Visitor<'de> for SimpleValueVisitor {
			type Value = SimpleValue;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("a string, a number, or a bool")
			}

			fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_i64(v).map(SimpleValue::Number)
			}

			fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_u64(v).map(SimpleValue::Number)
			}

			fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_f64(v).map(SimpleValue::Number)
			}

			fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Text(v.to_owned()))
			}

			/// `true` -> Present, `false` -> Absent
			fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(if v {
					SimpleValue::Present
				} else {
					SimpleValue::Absent
				})
			}
		}

		deserializer.deserialize_any(SimpleValueVisitor)
	}
}
