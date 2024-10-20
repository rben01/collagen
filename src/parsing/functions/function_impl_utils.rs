use compact_str::CompactString;

use super::{
	ArgCount, Arity, FunctionCallError, FunctionCallResult, FunctionCallSiteError,
	FunctionDatumType, VariableValue,
};

pub(super) trait FunctionTrait: Sized {
	fn name(self) -> &'static str;
}

/// NOTE: do not implement this for Function itself
pub(super) trait FallibleFunctionImpl: FunctionTrait {
	type Output;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = FunctionCallResult<VariableValue, E>>;

	fn arity_error<T, E>(self, expected: Arity, actual: Arity) -> FunctionCallResult<T, E> {
		Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
			func: self.name(),
			expected,
			actual,
		}))
	}

	fn ensure_number<V, E>(self, val: V, idx: ArgCount) -> FunctionCallResult<f64, E>
	where
		V: Into<FunctionCallResult<VariableValue, E>>,
	{
		let val = val.into()?;
		Ok(match val {
			VariableValue::Number(x) => x.into(),
			VariableValue::String(_) => {
				return Err(FunctionCallError::CallSite(
					FunctionCallSiteError::ArgumentType {
						func: self.name(),
						position: idx,
						expected: FunctionDatumType::Number,
						actual: FunctionDatumType::Text,
					},
				))
			}
		})
	}

	fn ensure_string<D, E>(self, val: D, idx: ArgCount) -> FunctionCallResult<CompactString, E>
	where
		D: Into<FunctionCallResult<VariableValue, E>>,
	{
		let val = val.into()?;
		Ok(match val {
			VariableValue::String(s) => s,
			VariableValue::Number(_) => {
				return Err(FunctionCallError::CallSite(
					FunctionCallSiteError::ArgumentType {
						func: self.name(),
						position: idx,
						expected: FunctionDatumType::Text,
						actual: FunctionDatumType::Number,
					},
				))
			}
		})
	}
}
