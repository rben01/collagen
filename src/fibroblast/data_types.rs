/// Contains the data types used for the in-memory representation of a `Fibroblast`
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use std::borrow::Cow;
use std::collections::HashMap;
use std::marker::PhantomData;

/// An enum whose variants each contain a (set of) JSON-representible values. It's
/// distinct from `serde_json::Value`, though.
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum Value {
	Dict(HashMap<String, Value>),
	List(Vec<Value>),
	Simple(SimpleValue),
}

/// An enum whose variants represent "simple" (indivisible) values.
#[derive(Debug)]
pub(crate) enum SimpleValue {
	Number(ConcreteNumber),
	Text(String),
	/// The presence of an attribute — usually represented `attr=""`
	Present,
	/// The absence of an attribute. How is this different from just ommitting the
	/// attribtue altogether? Having an explicit option to drop attribtues may come in
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
			Number(x) => Number(*x),
			Text(s) => Text(s.to_owned()),
			Present => Present,
			Absent => Absent,
		}
	}
}

/// Used for maximal flexibility when deserializing. It's hard to guarantee how numbers
/// are read in because reading from JSON doesn't imply `f64`. From
/// https://serde.rs/impl-deserialize.html:
/// > The JSON Deserializer will call `visit_i64` for any signed integer and `visit_u64`
/// > for any unsigned integer, even if hinted a different type.
///
/// Therefore we just accept all reasonable possibilities. We could try to convert the input to
/// just a single one of these types, but that might be lossy, depending on how
/// `serde_json` decided to read in the value.
///
/// Silver lining: we can store 64 bit numbers in JSON (not that I think one would need
/// one in an SVG)
#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum ConcreteNumber {
	Int(i64),
	UInt(u64),
	Float(f64),
}

impl std::fmt::Display for ConcreteNumber {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use self::ConcreteNumber::*;
		let s = match self {
			Int(x) => x.to_string(),
			UInt(x) => x.to_string(),
			Float(x) => x.to_string(),
		};
		f.write_str(s.as_str())
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
		struct SimpleValueVisitor(PhantomData<fn() -> SimpleValue>);

		impl<'de> de::Visitor<'de> for SimpleValueVisitor {
			type Value = SimpleValue;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("a string, a number, or a bool")
			}

			fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Text(v.to_owned()))
			}

			fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Number(ConcreteNumber::Int(v)))
			}

			fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Number(ConcreteNumber::UInt(v)))
			}

			fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Number(ConcreteNumber::Float(v)))
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

		deserializer.deserialize_any(SimpleValueVisitor(PhantomData))
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum VariableValue {
	Number(ConcreteNumber),
	String(String),
}

impl std::fmt::Display for VariableValue {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::Number(n) => write!(f, "{}", n),
			Self::String(s) => write!(f, "{}", s),
		}
	}
}
