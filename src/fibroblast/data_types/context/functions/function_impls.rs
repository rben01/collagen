use super::{
	Arity, FunctionCallError, FunctionCallResult, FunctionCallSiteError, FunctionDatumType,
	VariableValue,
};

pub(super) fn arity_error<T, E>(
	name: &'static str,
	expected: Arity,
	actual: Arity,
) -> FunctionCallResult<T, E> {
	return Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
		func: name,
		expected,
		actual,
	}));
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

#[macro_export]
macro_rules! gen_specific_function_enum {
	(enum $ty:ident { $($variant:ident),* $(,)? }) => {
		#[derive(Copy, Clone, Debug)]
		pub(super) enum $ty {
			$($variant),*
		}

		impl $ty {
			pub(crate) fn name(self) -> &'static str {
				self.into()
			}
		}

		impl From<$ty> for $crate::fibroblast::data_types::context::functions::Function {
			fn from(value: $ty) -> Self {
				match value {
					$($ty::$variant => { $crate::fibroblast::data_types::context::functions::Function::$variant }),*
				}
			}
		}
	};
}
