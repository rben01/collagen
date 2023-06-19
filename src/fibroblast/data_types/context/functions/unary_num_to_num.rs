use super::{
	arity_error,
	function_impls::{ensure_number, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab_case")]
pub(in crate::fibroblast::data_types::context) enum UnaryNumToNumFunction {
	// Boolean
	Not,
	// Numeric
	Abs,
	Floor,
	Ceil,
	Trunc,
	// Powers and logs
	Sqrt,
	Exp,
	Pow2,
	Pow10,
	Ln,
	Log2,
	Log10,
	// Trig
	Sin,
	Cos,
	Tan,
	Asin,
	Acos,
	Atan,
	// Hyperbolic trig
	Sinh,
	Cosh,
	Tanh,
	Asinh,
	Acosh,
	Atanh,
	// Float
	IsNan,
	IsInf,
}

impl FallibleFunctionImpl for UnaryNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryNumToNumFunction::*;

		let arity = Arity::Exactly(1);
		let mut args = args.into_iter();

		let Some(x) = args.next() else {
			return arity_error(self, arity, Arity::Exactly(0));
		};

		if args.next().is_some() {
			return arity_error(self, arity, Arity::AtLeast(2));
		}

		let x = ensure_number(self, x, 0)?;

		Ok(match self {
			Not => (x == 0.0).into(),

			Abs => x.abs(),
			Floor => x.floor(),
			Ceil => x.ceil(),
			Trunc => x.trunc(),
			Sqrt => x.sqrt(),

			Exp => x.exp(),
			Pow2 => x.exp2(),
			Pow10 => x.powi(10),
			Ln => x.ln(),
			Log2 => x.log2(),
			Log10 => x.log10(),

			Sin => x.sin(),
			Cos => x.cos(),
			Tan => x.tan(),
			Asin => x.asin(),
			Acos => x.acos(),
			Atan => x.atan(),

			Sinh => x.sinh(),
			Cosh => x.cosh(),
			Tanh => x.tanh(),
			Asinh => x.asinh(),
			Acosh => x.acosh(),
			Atanh => x.atanh(),

			IsNan => x.is_nan().into(),
			IsInf => x.is_infinite().into(),
		})
	}
}
