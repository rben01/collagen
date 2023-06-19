use super::{function_impl_utils::FallibleFunctionImpl, Arity, FunctionCallResult, VariableValue};
use crate::fibroblast::data_types::context::functions::arity_error;
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum UnaryTToT {
	Print,
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
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return arity_error(self, arity, Arity::AtLeast(2));
		}

		Ok(match self {
			Print => {
				println!("{v:?}");
				v
			}
		})
	}
}
