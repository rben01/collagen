use super::{
	function_impls::{arity_error, ensure_number, FallibleFunctionImpl},
	Arity, Function, FunctionCallResult, FunctionDatum,
};
use crate::gen_specifc_function_enum;

gen_specifc_function_enum!(
	enum VariadicNum2NumFunction {
		Add,
		Mul,
		Max,
		Min,
		And,
		Or,
	}
);

impl FallibleFunctionImpl for VariadicNum2NumFunction {
	type Output = f64;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: Iterator<Item = FunctionCallResult<FunctionDatum, E>>,
	{
		let mut args = args.enumerate();

		let Some((idx, acc)) = args.next() else {
			return arity_error(self.name(), Arity::AtLeast(1), Arity::Exactly(0));
		};

		let mut acc = ensure_number(self.name(), acc?, idx)?;

		for (idx, x) in args {
			let x = ensure_number(self.name(), x, idx)?;
			match self {
				Add => acc += x,
				Mul => acc *= x,
				Max => acc = acc.max(x),
				Min => acc = acc.min(x),
				And => acc = f64::from((acc != 0.0) && (x != 0.0)),
				Or => acc = f64::from((acc != 0.0) || (x != 0.0)),
			}
		}

		Ok(acc)
	}
}
