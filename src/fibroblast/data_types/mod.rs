//! Contains the data types used for the in-memory representation of a `Fibroblast`

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
pub(crate) use std::collections::BTreeMap as Map;

pub(crate) mod context;
pub use context::DecodingContext;

mod concrete_number;
#[cfg(test)]
pub(crate) use concrete_number::ConcreteNumber;

mod simple_value;
pub(crate) use simple_value::SimpleValue;

mod variable_value;
pub(crate) use variable_value::VariableValue;

/// A type alias for storing XML attribute key-value pairs
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct XmlAttrs(pub(crate) Map<String, SimpleValue>);

/// A vector of key, value pairs representing attributes
pub(crate) type AttrKVValueVec<'a> = Vec<(&'a str, Cow<'a, SimpleValue>)>;

/// Map of `String` -> `VariableValue`
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct TagVariables(pub(crate) Map<String, VariableValue>);
