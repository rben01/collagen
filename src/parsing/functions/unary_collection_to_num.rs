use super::{
	function_impl_utils::{arity_error, ensure_string, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryCollectionToStringFunction {
	Len,
	IsEmpty,
}

impl FallibleFunctionImpl for UnaryCollectionToStringFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryCollectionToStringFunction::*;

		let arity = Arity::Exactly(1);
		let mut args = args.into_iter();

		let s = match args.next() {
			// TODO: replace ensure_string with ensure_collection or similar
			Some(s) => ensure_string(self, s, 0)?,
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		if args.next().is_some() {
			return arity_error(self, arity, Arity::AtLeast(2));
		}

		#[allow(clippy::cast_precision_loss)]
		Ok(match self {
			Len => s.chars().count() as f64,
			IsEmpty => s.is_empty().into(),
		})
	}
}
