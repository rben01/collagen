use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryStringToNumFunction {
	Len,
	IsEmpty,
}

impl FunctionTrait for UnaryStringToNumFunction {
	fn name(self) -> &'static str {
		self.into()
	}
}

impl FallibleFunctionImpl for UnaryStringToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryStringToNumFunction::*;

		let arity = Arity::Exactly(1);
		let mut args = args.into_iter();

		let s = match args.next() {
			// TODO: replace ensure_string with ensure_collection or similar
			Some(s) => self.ensure_string(s, 0)?,
			None => return self.arity_error(arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return self.arity_error(arity, Arity::AtLeast(2));
		}

		#[allow(clippy::cast_precision_loss)]
		Ok(match self {
			Len => s.chars().count() as f64,
			IsEmpty => s.is_empty().into(),
		})
	}
}
