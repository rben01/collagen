use compact_str::CompactString;
use serde::{Deserialize, Serialize};

/// An enum whose variants represent "simple" (indivisible) values: number, text, or
/// bool. Bool represents the presence (`attr=""`) or absence (nothing) of an attribute.
//
// (*maybe* could be replaced with `SimpleValue<'a> { Text(Cow<'a, str>) }` but
// almost certainly not worth the cost of the refactor)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[cfg_attr(test, derive(PartialEq))]
pub(crate) enum SimpleValue {
	Number(serde_json::Number),
	Text(CompactString),
	/// The presence of an attribute — usually represented `attr=""` if true, or nothing
	/// (the explicit absence of an element) if false
	IsPresent(bool),
}

impl SimpleValue {
	/// Convert a JSON-reprentible f64 (ie neither NaN nor infinite) to this
	///
	/// Panics on NaN or inf, but since we only ever get our floats from JSON in
	/// the first place, that won't be a problem in practice.
	#[allow(dead_code)]
	pub(crate) fn from_json_f64(x: f64) -> Self {
		Self::Number(serde_json::Number::from_f64(x).unwrap())
	}
}
