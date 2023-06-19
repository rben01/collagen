use serde::{de, Deserialize, Deserializer, Serialize};

/// It's kind of dumb that we can't just derive `Deserialize` for [`ConcreteNumber`].
/// See docs for [`ConcretNumber`] as to why this isn't possible and why we need this
/// Visitor at all.
pub(super) struct ConcreteNumberVisitor;

impl<'de> de::Visitor<'de> for ConcreteNumberVisitor {
	type Value = ConcreteNumber;

	fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
		formatter.write_str("a number")
	}

	fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(ConcreteNumber::Int(v))
	}

	fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(ConcreteNumber::UInt(v))
	}

	fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(ConcreteNumber::Float(v))
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
/// [`ConcreteNumber`]; we need to actually implement [`ConcreteNumberVisitor`].
///
/// Silver lining: we can store 64 bit numbers in JSON (not that I think one would need
/// one in an SVG)
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum ConcreteNumber {
	Int(i64),
	UInt(u64),
	Float(f64),
}

impl From<ConcreteNumber> for f64 {
	fn from(cn: ConcreteNumber) -> Self {
		match cn {
			ConcreteNumber::Int(x) => x as f64,
			ConcreteNumber::UInt(x) => x as f64,
			ConcreteNumber::Float(x) => x,
		}
	}
}

impl From<f64> for ConcreteNumber {
	fn from(x: f64) -> Self {
		Self::Float(x)
	}
}

impl<'de> Deserialize<'de> for ConcreteNumber {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		deserializer.deserialize_any(ConcreteNumberVisitor)
	}
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

#[cfg(test)]
mod tests {
	use super::*;
	use serde_test::{assert_tokens, Token};

	impl std::cmp::PartialEq for ConcreteNumber {
		fn eq(&self, other: &Self) -> bool {
			use ConcreteNumber::*;
			match (self, other) {
				(Int(x), Int(y)) => x == y,
				(UInt(x), UInt(y)) => x == y,
				(Float(x), Float(y)) => x == y,
				_ => false,
			}
		}
	}

	#[test]
	fn test() {
		/// Tests (de)serializaton between `ConcreteNumber` and `Token`.
		///
		/// Has two forms:
		/// ```
		/// test_ser_de!(val, concrete_number_variant, serde_token_variant)
		/// test_ser_de!(concrete_number_variant(val1), serde_token_variant(val2))
		/// ```
		/// Examples (note that the variants must not be scoped; the scoping is
		/// added automatically):
		/// ```
		/// test_ser_de!(-2.5, Float, F64);
		/// // becomes this (which passes)
		/// assert_tokens(&ConcreteNumber::Float(-2.5), $[Token::F64(-2.5)]);
		///
		/// test_ser_de!(Int(0), I64(1));
		/// // becomes this (which fails)
		/// assert_tokens(&ConcreteNumber::Int(0), $[Token::I64(64)]);
		/// ```
		macro_rules! test_ser_de {
			($val:expr,  $cn_variant:ident,  $tok_variant:ident $(,)?) => {
				test_ser_de!($cn_variant($val), $tok_variant($val))
			};
			($cn_variant:ident ($cn_val:expr), $tok_variant:ident ($tok_val:expr) $(,)?) => {
				(assert_tokens)(
					&ConcreteNumber::$cn_variant($cn_val),
					&[Token::$tok_variant($tok_val)],
				);
			};
		}

		// floats
		test_ser_de!(-2.5, Float, F64);
		test_ser_de!(-1.0, Float, F64);
		test_ser_de!(0.0, Float, F64);
		test_ser_de!(-0.0, Float, F64);
		test_ser_de!(Float(0.0), F64(-0.0));
		test_ser_de!(Float(-0.0), F64(0.0));
		test_ser_de!(1.0, Float, F64);
		test_ser_de!(2.5, Float, F64);

		// ints
		test_ser_de!(-1, Int, I64);
		test_ser_de!(0, Int, I64);
		test_ser_de!(1, Int, I64);

		// unsigned ints
		test_ser_de!(0, UInt, U64);
		test_ser_de!(1, UInt, U64);
	}
}
