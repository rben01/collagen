use super::{
	Arity, Function, FunctionCallError, FunctionCallResult, FunctionCallSiteError, FunctionDatum,
	FunctionDatumType,
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
	name: &'static str,
	val: D,
	idx: usize,
) -> FunctionCallResult<f64, E>
where
	D: Into<FunctionCallResult<FunctionDatum, E>>,
{
	let val = val.into()?;
	Ok(match val {
		FunctionDatum::Number(x) => x,
		FunctionDatum::Text(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: name,
					position: idx,
					expected: FunctionDatumType::Number,
					actual: FunctionDatumType::Text,
				},
			))
		}
	})
}

pub(super) fn ensure_string<D, E>(
	name: &'static str,
	val: D,
	idx: usize,
) -> FunctionCallResult<String, E>
where
	D: Into<FunctionCallResult<FunctionDatum, E>>,
{
	let val = val.into()?;
	Ok(match val {
		FunctionDatum::Text(s) => s,
		FunctionDatum::Number(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: name,
					position: idx,
					expected: FunctionDatumType::Text,
					actual: FunctionDatumType::Number,
				},
			))
		}
	})
}

pub(super) trait FallibleFunctionImpl: Into<Function> {
	type Output;

	fn try_call<I, E>(self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: Iterator<Item = FunctionCallResult<FunctionDatum, E>>;
}

#[macro_export]
macro_rules! gen_specifc_function_enum {
	(enum $ty:ident { $($variant:ident),* $(,)? }) => {
		#[derive(Copy, Clone, Debug)]
		pub(super) enum $ty {
			$($variant),*
		}

		impl $ty {
			pub(crate) fn name(self) -> &'static str {
				Function::from(self).into()
			}
		}

		impl From<$ty> for Function {
			fn from(value: $ty) -> Self {
				match value {
					$($ty::$variant => { Function::$variant }),*
				}
			}
		}
	};
}
