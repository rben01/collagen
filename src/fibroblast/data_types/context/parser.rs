use std::borrow::Cow;

use super::{
	errors::{VariableSubstitutionError, VariableSubstitutionResult},
	functions::{
		BinaryFunction, NullaryFunction, TernaryFunction, UnaryFunction, VariadicFunction,
	},
	DecodingContext,
};
use crate::{fibroblast::data_types::VariableValue, utils::Set};
use nom::{
	branch::alt,
	bytes::complete::{is_not, tag},
	character::complete::{char, multispace0, multispace1, satisfy},
	combinator::{all_consuming, map, recognize, value},
	multi::{many0, many0_count},
	number::complete::double,
	sequence::{pair, preceded, tuple},
	IResult,
};

fn parse_char(input: &str, c: char) -> IResult<&str, char> {
	char(c)(input)
}

fn l_brace(input: &str) -> IResult<&str, char> {
	parse_char(input, '{')
}

fn r_brace(input: &str) -> IResult<&str, char> {
	parse_char(input, '}')
}

fn l_paren(input: &str) -> IResult<&str, char> {
	parse_char(input, '(')
}

fn r_paren(input: &str) -> IResult<&str, char> {
	parse_char(input, ')')
}

fn ident(input: &str) -> IResult<&str, &str> {
	recognize(pair(
		satisfy(|c| c.is_alphabetic() || c == '_' || c == '-'),
		many0_count(satisfy(|c| c.is_alphanumeric() || c == '_' || c == '-')),
	))(input)
}

fn word(input: &str) -> IResult<&str, &str> {
	is_not("\\(){} \t\n\r")(input)
}

fn esc_char(input: &str) -> IResult<&str, &str> {
	alt((
		value("\\", tag(r"\\")),
		value("{", tag(r"\{")),
		value("}", tag(r"\}")),
	))(input)
}

fn arg(input: &str) -> IResult<&str, Arg<'_>> {
	alt((
		map(double, Arg::Lit),
		map(word, Arg::Var),
		map(s_expr, Arg::SExpr),
	))(input)
}

fn s_expr(input: &str) -> IResult<&str, SExpr> {
	let (rest, (_, _, fn_name, args, _, _)) = tuple((
		l_paren,
		multispace0,
		word,
		many0(preceded(multispace1, arg)),
		multispace0,
		r_paren,
	))(input)?;

	Ok((rest, SExpr { fn_name, args }))
}

fn brace_expr(input: &str) -> IResult<&str, BracedExpr<'_>> {
	let (rest, (_, _, braced, _, _)) = tuple((
		l_brace,
		multispace0,
		alt((map(word, BracedExpr::Var), map(s_expr, BracedExpr::SExpr))),
		multispace0,
		r_brace,
	))(input)?;

	Ok((rest, braced))
}

pub(super) fn is_valid_var_name(s: &str) -> bool {
	all_consuming(ident)(s).is_ok()
}

#[derive(Debug)]
enum BracedExpr<'a> {
	Var(&'a str),
	SExpr(SExpr<'a>),
}

#[derive(Debug)]
enum Arg<'a> {
	Lit(f64),
	Var(&'a str),
	SExpr(SExpr<'a>),
}

impl Arg<'_> {
	fn eval(
		&self,
		context: &'_ DecodingContext<'_>,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<f64> {
		Ok(match self {
			Arg::Lit(x) => *x,
			Arg::Var(var) => {
				let var = *var;
				let val = context.eval_variable(var, variables_referenced)?;
				match val {
					VariableValue::Number(n) => n.into(),
					VariableValue::String(s) => {
						return Err(vec![VariableSubstitutionError::ExpectedNumGotString {
							variable: var.to_owned(),
							value: s,
						}])
					}
				}
			}
			Arg::SExpr(ex) => ex.eval(context, variables_referenced)?,
		})
	}
}

#[derive(Debug)]
struct SExpr<'a> {
	fn_name: &'a str,
	args: Vec<Arg<'a>>,
}

impl SExpr<'_> {
	fn eval(
		&self,
		context: &'_ DecodingContext<'_>,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<f64> {
		let Self { fn_name, args } = self;
		let fn_name = *fn_name;
		let args_iter = args
			.iter()
			.map(|arg| arg.eval(context, variables_referenced));

		if let Ok(func) = fn_name.parse::<VariadicFunction>() {
			func.try_call(args_iter)
		} else if let Ok(func) = fn_name.parse::<TernaryFunction>() {
			func.try_call(args_iter)
		} else if let Ok(func) = fn_name.parse::<BinaryFunction>() {
			func.try_call(args_iter)
		} else if let Ok(func) = fn_name.parse::<UnaryFunction>() {
			func.try_call(args_iter)
		} else if let Ok(func) = fn_name.parse::<NullaryFunction>() {
			func.try_call(args_iter)
		} else {
			return Err(vec![VariableSubstitutionError::UnrecognizedFunctionName(
				fn_name.to_owned(),
			)]);
		}
		.map_err(Vec::<VariableSubstitutionError>::from)
	}
}

pub(super) fn parse<'a>(
	input: &'a str,
	context: &DecodingContext,
	variables_referenced: &Set<String>,
) -> VariableSubstitutionResult<Cow<'a, str>> {
	if input.is_empty() {
		return Ok(input.into());
	}

	let mut parsing_errs = Vec::new();

	let parse_res = all_consuming(many0(alt((
		map(brace_expr, |braced| -> VariableSubstitutionResult<_> {
			Ok(match braced {
				BracedExpr::Var(var) => match context.eval_variable(var, variables_referenced) {
					Ok(x) => Cow::Owned(x.as_str().into_owned()),
					Err(e) => {
						parsing_errs.extend(e);
						Cow::Borrowed("")
					}
				},
				BracedExpr::SExpr(ex) => {
					Cow::Owned(ex.eval(context, variables_referenced)?.to_string())
				}
			})
		}),
		map(esc_char, |s| Ok(Cow::Borrowed(s))),
		map(is_not(r"\{}"), |s| Ok(Cow::Borrowed(s))),
	))))(input);

	let (rest, ans) = match parse_res {
		Ok(x) => x,
		Err(e) => {
			match e {
				nom::Err::Error(e) => {
					parsing_errs.push(VariableSubstitutionError::Parsing(e.to_string()))
				}
				_ => unreachable!(),
			};
			return Err(parsing_errs);
		}
	};

	if !parsing_errs.is_empty() {
		return Err(parsing_errs);
	}

	assert!(rest.is_empty(), "input remaining: {rest:?}");
	Ok(ans.into_iter().collect::<Result<String, _>>()?.into())
}
