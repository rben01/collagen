use super::{function_impl_utils::FallibleFunctionImpl, Arity, FunctionCallResult, VariableValue};
use crate::fibroblast::data_types::context::functions::{
	arity_error, function_impl_utils::ensure_string,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum UnaryStringToStringFunction {
	Uppercase,
	Lowercase,
	Trim,
	Ltrim,
	Rtrim,
}

impl FallibleFunctionImpl for UnaryStringToStringFunction {
	type Output = String;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryStringToStringFunction::*;

		let arity = Arity::Exactly(1);
		let mut args = args.into_iter();

		let s = match args.next() {
			Some(s) => ensure_string(self, s, 0)?,
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return arity_error(self, arity, Arity::AtLeast(2));
		}

		Ok(match self {
			Uppercase => s.to_uppercase(),
			Lowercase => s.to_lowercase(),
			Trim => s.trim().to_owned(),
			Ltrim => s.trim_start().to_owned(),
			Rtrim => s.trim_end().to_owned(),
		})
	}
}
