use super::concrete_number::ConcreteNumber;
use super::simple_value::SimpleValue;
use super::Map;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// An enum whose variants each contain a (set of) JSON-representible values. It's
/// distinct from `serde_json::Value`, though.
#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum Value {
	Dict(Map<String, Value>),
	List(Vec<Value>),
	Simple(SimpleValue),
}

/// The value of a variable; either a number or a string
#[derive(Serialize, Deserialize, Debug)]
#[cfg_attr(test, derive(Clone, PartialEq))]
#[serde(untagged)]
pub(crate) enum VariableValue {
	Number(ConcreteNumber),
	String(String),
}

impl VariableValue {
	pub fn as_str(&self) -> Cow<'_, str> {
		use VariableValue::*;
		match self {
			Number(n) => Cow::Owned(n.to_string()),
			String(s) => Cow::Borrowed(s.as_ref()),
		}
	}
}

impl From<ConcreteNumber> for VariableValue {
	fn from(x: ConcreteNumber) -> Self {
		Self::Number(x)
	}
}

impl From<String> for VariableValue {
	fn from(s: String) -> Self {
		Self::String(s)
	}
}
