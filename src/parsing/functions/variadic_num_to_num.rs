use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum VariadicNumToNumFunction {
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,
}

impl FunctionTrait for VariadicNumToNumFunction {
	fn name(self) -> &'static str {
		self.into()
	}
}

impl FallibleFunctionImpl for VariadicNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use VariadicNumToNumFunction::*;

		let mut args = args.into_iter().enumerate();

		let Some((idx, acc)) = args.next() else {
			return self.arity_error(Arity::AtLeast(1), Arity::Exactly(0));
		};

		let mut acc = self.ensure_number(acc, idx)?;

		for (idx, x) in args {
			let x = self.ensure_number(x, idx)?;
			match self {
				Add => acc += x,
				Mul => acc *= x,
				Max => acc = acc.max(x),
				Min => acc = acc.min(x),
				And => acc = f64::from((acc != 0.0) && (x != 0.0)),
				Or => acc = f64::from((acc != 0.0) || (x != 0.0)),
			}
		}

		Ok(acc)
	}
}
