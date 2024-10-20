mod binary_num_to_num;
mod constants;
mod function_impl_utils;
mod ternary_any;
mod unary_collection_to_num;
mod unary_num_to_num;
mod unary_or_binary_num_to_num;
mod unary_string_to_string;
mod unary_t_to_t;
mod variadic_num_to_num;

use self::{
	binary_num_to_num::BinaryNumToNumFunction, constants::ConstantFunction,
	ternary_any::TernaryAnyFunction, unary_collection_to_num::UnaryCollectionToStringFunction,
	unary_num_to_num::UnaryNumToNumFunction,
	unary_or_binary_num_to_num::UnaryOrBinaryNumToNumFunction,
	unary_string_to_string::UnaryStringToStringFunction, unary_t_to_t::UnaryTToT,
	variadic_num_to_num::VariadicNumToNumFunction,
};
use crate::fibroblast::data_types::VariableValue;
use std::str::FromStr;

type ArgCount = u8;

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum Arity {
	Exactly(ArgCount),
	Between(ArgCount, ArgCount),
	AtLeast(ArgCount),
	AtMost(ArgCount),
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
		position: ArgCount,
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
	UnaryTToT(UnaryTToT),
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
		// TODO: can this be simplified?
		fn_name
			.parse()
			.map(Self::Constant)
			.or_else(|_| fn_name.parse().map(Self::UnaryNumToNum))
			.or_else(|_| fn_name.parse().map(Self::UnaryTToT))
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
		use function_impl_utils::FallibleFunctionImpl;
		use Function::*;

		let args = args
			.into_iter()
			.map(|res| res.map_err(FunctionCallError::Upstream));

		Ok(match self {
			Constant(f) => f.try_call(args)?.into(),
			UnaryNumToNum(f) => f.try_call(args)?.into(),
			UnaryTToT(f) => f.try_call(args)?,
			UnaryOrBinaryNumToNum(f) => f.try_call(args)?.into(),
			BinaryNumToNum(f) => f.try_call(args)?.into(),
			VariadicNumToNum(f) => f.try_call(args)?.into(),
			UnaryStringToString(f) => f.try_call(args)?.into(),
			UnaryCollectionToString(f) => f.try_call(args)?.into(),
			Ternary(f) => f.try_call(args)?,
		})
	}
}
