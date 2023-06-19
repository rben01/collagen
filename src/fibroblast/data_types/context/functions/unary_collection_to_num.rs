use super::{function_impls::FallibleFunctionImpl, Arity, FunctionCallResult, VariableValue};
use crate::fibroblast::data_types::context::functions::{
	arity_error, function_impls::ensure_string,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum UnaryCollectionToStringFunction {
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

		Ok(match self {
			Len => s.chars().count() as f64,
			IsEmpty => s.is_empty().into(),
		})
	}
}
