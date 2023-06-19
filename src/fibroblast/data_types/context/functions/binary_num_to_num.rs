use super::{
	arity_error,
	function_impl_utils::{ensure_number, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum BinaryNumToNumFunction {
	#[strum(serialize = "/")]
	Div,
	#[strum(serialize = "%")]
	Mod,
	Pow,
	Atan2,
	#[strum(serialize = "<")]
	Lt,
	#[strum(serialize = "<=")]
	Le,
	#[strum(serialize = "=")]
	Eq,
	#[strum(serialize = ">")]
	Gt,
	#[strum(serialize = ">=")]
	Ge,
}

impl FallibleFunctionImpl for BinaryNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use BinaryNumToNumFunction::*;

		let arity = Arity::Exactly(2);
		let mut args = args.into_iter().enumerate();

		let a = match args.next() {
			Some((idx, a)) => ensure_number(self, a, idx)?,
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		let b = match args.next() {
			Some((idx, b)) => ensure_number(self, b, idx)?,
			None => return arity_error(self, arity, Arity::Exactly(1)),
		};

		if let Some((idx, _)) = args.next() {
			return arity_error(self, arity, Arity::AtLeast(idx + 1));
		}

		Ok(match self {
			Div => a / b,
			Mod => a % b,
			Pow => a.powf(b),
			// a tad confusing; the first argument is the "y" of atan2, the second is
			// the "x"; a.atan2(b) is atan2(b, a), and so these arguments are in the
			// correct order
			Atan2 => a.atan2(b),
			Lt => (a < b).into(),
			Le => (a <= b).into(),
			Eq => (a == b).into(),
			Gt => (a > b).into(),
			Ge => (a >= b).into(),
		})
	}
}
