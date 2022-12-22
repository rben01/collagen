//! Contains the data types used for the in-memory representation of a `Fibroblast`.

use serde::{Deserialize, Serialize};
pub(crate) use std::collections::{btree_map::Entry as MapEntry, BTreeMap as Map};
use std::{
	borrow::Cow,
	ops::{Deref, DerefMut},
};

pub(crate) mod context;
pub use context::DecodingContext;

mod concrete_number;
pub(crate) use concrete_number::ConcreteNumber;

mod simple_value;
pub(crate) use simple_value::SimpleValue;

mod variable_value;
pub(crate) use variable_value::VariableValue;

/// A type alias for storing XML attribute key-value pairs
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct XmlAttrs(pub(crate) Map<String, SimpleValue>);

impl Deref for XmlAttrs {
	type Target = Map<String, SimpleValue>;

	fn deref(&self) -> &Self::Target {
		&self.0
	}
}

type AttrKVPair<'a> = (&'a str, Cow<'a, SimpleValue>);

/// A vector of key, value pairs representing attributes
pub(crate) struct AttrKVValueVec<'a>(Vec<AttrKVPair<'a>>);

impl<'a> Deref for AttrKVValueVec<'a> {
	type Target = Vec<AttrKVPair<'a>>;

	fn deref(&self) -> &Self::Target {
		&self.0
	}
}

impl<'a> DerefMut for AttrKVValueVec<'a> {
	fn deref_mut(&mut self) -> &mut Self::Target {
		&mut self.0
	}
}

impl<'a> IntoIterator for AttrKVValueVec<'a> {
	type IntoIter = <Vec<AttrKVPair<'a>> as IntoIterator>::IntoIter;
	type Item = AttrKVPair<'a>;

	fn into_iter(self) -> Self::IntoIter {
		self.0.into_iter()
	}
}

/// Map of `String` -> `VariableValue`
#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct TagVariables(pub(crate) Map<String, VariableValue>);
