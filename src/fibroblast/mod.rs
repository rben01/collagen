use quick_xml::{
	events::{BytesEnd, BytesStart, Event},
	Result as XmlResult, Writer,
};
use serde::{de::Visitor, Deserialize, Deserializer, Serialize, Serializer};
use std::io::Cursor;
use std::{collections::HashMap, marker::PhantomData};

type StringDict<V> = HashMap<String, V>;

// Any resemblence to serde_json::Value is coincidental
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Value {
	Dict(StringDict<Value>),
	List(Vec<Value>),
	Atomic(IndivisibleValue),
}

enum IndivisibleValue {
	Number(ConcreteNumber),
	Text(String),
	Present,
	Absent,
	Unspecified,
}

enum ConcreteNumber {
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

impl Serialize for IndivisibleValue {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		use self::ConcreteNumber::*;
		use self::IndivisibleValue::*;

		match self {
			Number(Int(x)) => serializer.serialize_i64(*x),
			Number(UInt(x)) => serializer.serialize_u64(*x),
			Number(Float(x)) => serializer.serialize_f64(*x),
			Text(s) => serializer.serialize_str(s),
			Present => serializer.serialize_bool(true),
			Absent => serializer.serialize_bool(false),
			Unspecified => serializer.serialize_unit(),
		}
	}
}

struct IndivisibleValueVisitor(PhantomData<fn() -> IndivisibleValue>);

impl<'de> Visitor<'de> for IndivisibleValueVisitor {
	type Value = IndivisibleValue;

	fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
		formatter.write_str("A string, a number, `true`, `false`, or `null`")
	}

	fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(IndivisibleValue::Text(v.to_owned()))
	}

	fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(IndivisibleValue::Number(ConcreteNumber::Int(v)))
	}

	fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(IndivisibleValue::Number(ConcreteNumber::UInt(v)))
	}

	fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(IndivisibleValue::Number(ConcreteNumber::Float(v)))
	}

	fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(if v {
			IndivisibleValue::Present
		} else {
			IndivisibleValue::Absent
		})
	}

	fn visit_unit<E>(self) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(IndivisibleValue::Unspecified)
	}
}

impl<'de> Deserialize<'de> for IndivisibleValue {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		deserializer.deserialize_any(IndivisibleValueVisitor(PhantomData))
	}
}

#[derive(Serialize, Deserialize)]
pub struct Fibroblast {
	#[serde(rename = "type")]
	kind: String,
	attrs: StringDict<IndivisibleValue>,
	children: Vec<Value>,
}

impl Fibroblast {
	fn attrs_to_key_value_pairs(&self) -> impl IntoIterator<Item = (&str, String)> {
		use self::IndivisibleValue::*;

		self.attrs.iter().filter_map(|(k, v)| {
			let v_maybe_string = match v {
				Number(x) => Some(x.to_string()),
				Text(s) => Some((*s).to_owned()),
				Present => Some("".to_owned()),
				Absent | Unspecified => None,
			};

			v_maybe_string.map(|v_string| (k.as_str(), v_string))
		})
	}
	pub fn to_svg(&self) -> XmlResult<String> {
		let mut writer = Writer::new(Cursor::new(Vec::new()));
		let mut elem = BytesStart::owned(self.kind.as_bytes(), self.kind.len());
		let attributes: Vec<(&str, String)> = self.attrs_to_key_value_pairs().into_iter().collect();

		elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_str())));
		writer.write_event(Event::Start(elem))?;
		writer.write_event(Event::End(BytesEnd::borrowed(self.kind.as_bytes())))?;
		writer.write_event(Event::Eof)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?;

		Ok(out_string.to_owned())
	}
}
