use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::marker::PhantomData;

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Value {
	Dict(HashMap<String, Value>),
	List(Vec<Value>),
	Simple(SimpleValue),
}

pub(crate) enum SimpleValue {
	Number(ConcreteNumber),
	Text(String),
	Present,
	Absent,
}

impl Clone for SimpleValue {
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

#[derive(Clone, Copy)]
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

struct SimpleValueVisitor(PhantomData<fn() -> SimpleValue>);

impl<'de> de::Visitor<'de> for SimpleValueVisitor {
	type Value = SimpleValue;

	fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
		formatter.write_str("Expecting a string, a number, a bool, or `null`")
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

impl<'de> Deserialize<'de> for SimpleValue {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		deserializer.deserialize_any(SimpleValueVisitor(PhantomData))
	}
}
