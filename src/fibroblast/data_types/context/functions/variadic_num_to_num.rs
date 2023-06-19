use super::{
	function_impls::{arity_error, ensure_number, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum VariadicNumToNumFunction {
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,
}

impl FallibleFunctionImpl for VariadicNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use VariadicNumToNumFunction::*;

		let mut args = args.into_iter().enumerate();
		let name = self.into();

		let Some((idx, acc)) = args.next() else {
			return arity_error(name, Arity::AtLeast(1), Arity::Exactly(0));
		};

		let mut acc = ensure_number(name, acc, idx)?;

		for (idx, x) in args {
			let x = ensure_number(name, x, idx)?;
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
