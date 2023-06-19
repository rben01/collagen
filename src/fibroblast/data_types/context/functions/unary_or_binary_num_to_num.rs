use super::{
	arity_error,
	function_impls::{ensure_number, FallibleFunctionImpl},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(in crate::fibroblast::data_types::context) enum UnaryOrBinaryNumToNumFunction {
	#[strum(serialize = "-")]
	Sub,
	Round,
}

impl FallibleFunctionImpl for UnaryOrBinaryNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryOrBinaryNumToNumFunction::*;

		let arity = Arity::Between(1, 2);
		let mut args = args.into_iter().enumerate();

		let a = match args.next() {
			Some((idx, a)) => ensure_number(self, a, idx)?,
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		let ans = match args.next() {
			Some((idx, b)) => {
				let b = ensure_number(self, b, idx)?;
				if let Some((idx, _)) = args.next() {
					return arity_error(self, arity, Arity::AtLeast(idx + 1));
				}
				match self {
					Sub => a - b,
					Round => {
						let pow10 = 10.0_f64.powf(b);
						(a * pow10).round() / pow10
					}
				}
			}
			None => match self {
				Sub => -a,
				Round => a.round(),
			},
		};

		Ok(ans)
	}
}
