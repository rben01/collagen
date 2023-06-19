use strum_macros::{EnumString, IntoStaticStr};

use super::{
	arity_error, function_impls::FallibleFunctionImpl, Arity, FunctionCallResult, VariableValue,
};
use std::f64::{self, consts};

#[derive(Clone, Copy, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab_case")]
pub(in crate::fibroblast::data_types::context) enum ConstantFunction {
	E,
	Pi,
	Nan,
	Inf,
}

impl FallibleFunctionImpl for ConstantFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use ConstantFunction::*;

		if args.into_iter().next().is_some() {
			return arity_error(self, Arity::Exactly(0), Arity::AtLeast(1));
		}

		Ok(match self {
			E => consts::E,
			Pi => consts::PI,
			Nan => f64::NAN,
			Inf => f64::INFINITY,
		})
	}
}
