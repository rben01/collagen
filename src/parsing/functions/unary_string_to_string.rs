use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
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

impl FunctionTrait for UnaryStringToStringFunction {
	fn name(self) -> &'static str {
		self.into()
	}
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
			Some(s) => self.ensure_string(s, 0)?,
			None => return self.arity_error(arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return self.arity_error(arity, Arity::AtLeast(2));
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
