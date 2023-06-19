mod binary_num_to_num;
mod constants;
mod function_impl_utils;
mod ternary_any;
mod unary_collection_to_num;
mod unary_num_to_num;
mod unary_or_binary_num_to_num;
mod unary_string_to_string;
mod variadic_num_to_num;

use self::{
	binary_num_to_num::BinaryNumToNumFunction, constants::ConstantFunction,
	ternary_any::TernaryAnyFunction, unary_collection_to_num::UnaryCollectionToStringFunction,
	unary_num_to_num::UnaryNumToNumFunction,
	unary_or_binary_num_to_num::UnaryOrBinaryNumToNumFunction,
	unary_string_to_string::UnaryStringToStringFunction,
	variadic_num_to_num::VariadicNumToNumFunction,
};
use crate::fibroblast::data_types::{
	context::functions::function_impl_utils::FallibleFunctionImpl, VariableValue,
};
use std::str::FromStr;

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum Arity {
	Exactly(usize),
	Between(usize, usize),
	AtLeast(usize),
	AtMost(usize),
}

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum FunctionCallSiteError {
	Arity {
		func: &'static str,
		expected: Arity,
		actual: Arity,
	},
	ArgumentType {
		func: &'static str,
		position: usize,
		expected: FunctionDatumType,
		actual: FunctionDatumType,
	},
}

pub(super) enum FunctionCallError<E> {
	CallSite(FunctionCallSiteError),
	Upstream(E),
}

impl<E> From<FunctionCallSiteError> for FunctionCallError<E> {
	fn from(err: FunctionCallSiteError) -> Self {
		Self::CallSite(err)
	}
}

type FunctionCallResult<T, E> = Result<T, FunctionCallError<E>>;

// TODO: replace Result<T, E> with Result<!, E> when stabilized
// (and remove generic T altogether)
// never_type https://github.com/rust-lang/rust/issues/35121
fn arity_error<T, Me: Into<&'static str>, E>(
	func: Me,
	expected: Arity,
	actual: Arity,
) -> FunctionCallResult<T, E> {
	return Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
		func: func.into(),
		expected,
		actual,
	}));
}

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum FunctionDatumType {
	Number,
	Text,
	List,
	Iterable,
}

#[derive(Copy, Clone, Debug)]
pub(super) enum Function {
	Constant(ConstantFunction),
	UnaryNumToNum(UnaryNumToNumFunction),
	UnaryOrBinaryNumToNum(UnaryOrBinaryNumToNumFunction),
	BinaryNumToNum(BinaryNumToNumFunction),
	VariadicNumToNum(VariadicNumToNumFunction),
	UnaryStringToString(UnaryStringToStringFunction),
	UnaryCollectionToString(UnaryCollectionToStringFunction),
	Ternary(TernaryAnyFunction),
}

impl FromStr for Function {
	type Err = String;

	fn from_str(fn_name: &str) -> Result<Self, Self::Err> {
		fn_name
			.parse()
			.map(Self::Constant)
			.or_else(|_| fn_name.parse().map(Self::UnaryNumToNum))
			.or_else(|_| fn_name.parse().map(Self::UnaryOrBinaryNumToNum))
			.or_else(|_| fn_name.parse().map(Self::BinaryNumToNum))
			.or_else(|_| fn_name.parse().map(Self::VariadicNumToNum))
			.or_else(|_| fn_name.parse().map(Self::UnaryStringToString))
			.or_else(|_| fn_name.parse().map(Self::UnaryCollectionToString))
			.or_else(|_| fn_name.parse().map(Self::Ternary))
			.map_err(|_| fn_name.to_owned())
	}
}

impl Function {
	pub(super) fn try_call<I, E>(self, args: I) -> FunctionCallResult<VariableValue, E>
	where
		I: IntoIterator<Item = Result<VariableValue, E>>,
	{
		use Function::*;

		let args = args
			.into_iter()
			.map(|res| res.map_err(FunctionCallError::Upstream));

		Ok(match self {
			Constant(f) => f.try_call(args)?.into(),
			UnaryNumToNum(f) => f.try_call(args)?.into(),
			UnaryOrBinaryNumToNum(f) => f.try_call(args)?.into(),
			BinaryNumToNum(f) => f.try_call(args)?.into(),
			VariadicNumToNum(f) => f.try_call(args)?.into(),
			UnaryStringToString(f) => f.try_call(args)?.into(),
			UnaryCollectionToString(f) => f.try_call(args)?.into(),
			Ternary(f) => f.try_call(args)?.into(),
		})
	}
}
