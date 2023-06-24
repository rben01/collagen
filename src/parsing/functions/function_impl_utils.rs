use super::{
	Arity, FunctionCallError, FunctionCallResult, FunctionCallSiteError, FunctionDatumType,
	VariableValue,
};

// TODO: replace Result<T, E> with Result<!, E> when stabilized
// (and remove generic T altogether)
// never_type https://github.com/rust-lang/rust/issues/35121
pub(super) fn arity_error<T, Me: Into<&'static str>, E>(
	func: Me,
	expected: Arity,
	actual: Arity,
) -> FunctionCallResult<T, E> {
	Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
		func: func.into(),
		expected,
		actual,
	}))
}

pub(super) fn ensure_number<D, E>(
	func: impl Into<&'static str>,
	val: D,
	idx: usize,
) -> FunctionCallResult<f64, E>
where
	D: Into<FunctionCallResult<VariableValue, E>>,
{
	let val = val.into()?;
	Ok(match val {
		VariableValue::Number(x) => x.into(),
		VariableValue::String(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: func.into(),
					position: idx,
					expected: FunctionDatumType::Number,
					actual: FunctionDatumType::Text,
				},
			))
		}
	})
}

pub(super) fn ensure_string<T, D, E>(func: T, val: D, idx: usize) -> FunctionCallResult<String, E>
where
	T: Into<&'static str>,
	D: Into<FunctionCallResult<VariableValue, E>>,
{
	let val = val.into()?;
	Ok(match val {
		VariableValue::String(s) => s,
		VariableValue::Number(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: func.into(),
					position: idx,
					expected: FunctionDatumType::Text,
					actual: FunctionDatumType::Number,
				},
			))
		}
	})
}

pub(super) trait FallibleFunctionImpl: Into<&'static str> {
	type Output;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>;
}
