use super::{
	function_impl_utils::{FallibleFunctionImpl, FunctionTrait},
	Arity, FunctionCallResult, VariableValue,
};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(crate) enum UnaryOrBinaryNumToNumFunction {
	#[strum(serialize = "-")]
	Sub,
	Round,
}

impl FunctionTrait for UnaryOrBinaryNumToNumFunction {
	fn name(self) -> &'static str {
		self.into()
	}
}

impl FallibleFunctionImpl for UnaryOrBinaryNumToNumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>,
	{
		use UnaryOrBinaryNumToNumFunction::*;

		let arity = Arity::Between(1, 2);
		let mut args = (0..).zip(args);

		let a = match args.next() {
			Some((idx, a)) => self.ensure_number(a, idx)?,
			None => return self.arity_error(arity, Arity::Exactly(0)),
		};

		let ans = match args.next() {
			Some((idx, b)) => {
				let b = self.ensure_number(b, idx)?;
				if let Some((idx, _)) = args.next() {
					return self.arity_error(arity, Arity::AtLeast(idx + 1));
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
