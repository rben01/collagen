use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryTToT {
	Print,
}

impl FunctionTrait for UnaryTToT {
	fn name(self) -> &'static str {
		self.into()
	}
}

impl FallibleFunctionImpl for UnaryTToT {
	type Output = VariableValue;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryTToT::*;

		let arity = Arity::Exactly(1);
		let mut args = args.into_iter();

		let v = match args.next() {
			Some(v) => v?,
			None => return self.arity_error(arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return self.arity_error(arity, Arity::AtLeast(2));
		}

		Ok(match self {
			Print => {
				println!("{v:?}");
				v
			}
		})
	}
}
