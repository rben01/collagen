use super::{
	function_impl_utils::{arity_error, ensure_number, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum TernaryAnyFunction {
	#[strum(serialize = "if")]
	IfElse,
}

impl FallibleFunctionImpl for TernaryAnyFunction {
	type Output = VariableValue;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use TernaryAnyFunction::*;

		let arity = Arity::Exactly(3);
		let mut args = args.into_iter();

		Ok(match self {
			IfElse => {
				let pred = match args.next() {
					Some(pred) => ensure_number(self, pred, 0)?,
					None => return arity_error(self, arity, Arity::Exactly(0)),
				};

				let if_true = match args.next() {
					Some(pred) => pred?,
					None => return arity_error(self, arity, Arity::Exactly(1)),
				};

				let if_false = match args.next() {
					Some(pred) => pred?,
					None => return arity_error(self, arity, Arity::Exactly(2)),
				};

				if pred == 0.0 {
					if_false
				} else {
					if_true
				}
			}
		})
	}
}
