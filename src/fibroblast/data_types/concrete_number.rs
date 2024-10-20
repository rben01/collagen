use serde::{de, Deserialize, Deserializer, Serialize};

/// It's kind of dumb that we can't just derive `Deserialize` for [`ConcreteNumber`].
/// See docs for [`ConcretNumber`] as to why this isn't possible and why we need this
/// Visitor at all.
pub(super) struct ConcreteNumberVisitor;

impl<'de> de::Visitor<'de> for ConcreteNumberVisitor {
	type Value = Number;

	fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
		formatter.write_str("a number")
	}

	fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		#[allow(clippy::cast_precision_loss)]
		Ok(Number(v as f64))
	}

	fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		#[allow(clippy::cast_precision_loss)]
		Ok(Number(v as f64))
	}

	fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(Number(v))
	}
}

/// Used for maximal flexibility when deserializing. It's hard to guarantee how numbers
/// are read in because reading from JSON doesn't imply `f64`. From
/// <https://serde.rs/impl-deserialize.html>:
/// > The JSON Deserializer will call `visit_i64` for any signed integer and `visit_u64`
/// > for any unsigned integer, even if hinted a different type.
///
/// Therefore we just accept all reasonable possibilities. We could try to convert the input to
/// just a single one of these types, but that might be lossy, depending on how
/// `serde_json` decided to read in the value.
///
/// Furthermore, for the same reason, we can't just derive `Deserialize` for
/// [`Number`]; we need to actually implement [`ConcreteNumberVisitor`].
///
/// Silver lining: we can store 64 bit numbers in JSON (not that I think one would need
/// one in an SVG)
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(transparent)]
pub(crate) struct Number(pub(crate) f64);

impl From<Number> for f64 {
	fn from(x: Number) -> Self {
		x.0
	}
}

impl From<f64> for Number {
	fn from(x: f64) -> Self {
		Self(x)
	}
}

impl<'de> Deserialize<'de> for Number {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		deserializer.deserialize_any(ConcreteNumberVisitor)
	}
}

impl std::fmt::Display for Number {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "{}", self.0)
	}
}
