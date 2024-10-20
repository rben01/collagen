use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
	Arity, FunctionCallResult, VariableValue,
};
use std::f64::consts::PI;
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryNumToNumFunction {
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
	Deg2rad,
	Rad2deg,
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

impl FunctionTrait for UnaryNumToNumFunction {
	fn name(self) -> &'static str {
		self.into()
	}
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
			return self.arity_error(arity, Arity::Exactly(0));
		};

		if args.next().is_some() {
			return self.arity_error(arity, Arity::AtLeast(2));
		}

		let x = self.ensure_number(x, 0)?;

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
			Deg2rad => x * PI / 180.0,
			Rad2deg => x * 180.0 / PI,

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
