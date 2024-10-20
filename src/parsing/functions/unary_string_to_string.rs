use super::{
	function_impl_utils::{arity_error, ensure_string, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use compact_str::{CompactString, ToCompactString};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryStringToStringFunction {
	Uppercase,
	Lowercase,
	Trim,
	Ltrim,
	Rtrim,
}

impl FallibleFunctionImpl for UnaryStringToStringFunction {
	type Output = CompactString;

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
			Trim => s.trim().to_compact_string(),
			Ltrim => s.trim_start().to_compact_string(),
			Rtrim => s.trim_end().to_compact_string(),
		})
	}
}
