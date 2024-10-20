use std::{borrow::Cow, cell::RefCell};

use super::{
	errors::{VariableEvaluationError, VariableSubstitutionResult},
	functions::Function,
};
use crate::{
	fibroblast::data_types::{DecodingContext, VariableValue},
	utils::Set,
};
use nom::{
	branch::alt,
	bytes::complete::is_not,
	character::complete::{char, multispace0, none_of, satisfy},
	combinator::{all_consuming, eof, map, opt, recognize, value},
	multi::{many0, many0_count},
	number::complete::double,
	sequence::{delimited, pair, preceded, terminated},
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
	preceded(
		char('\\'),
		alt((
			value("\\", char('\\')),
			value("{", char('{')),
			value("}", char('}')),
		)),
	)(input)
}

fn invalid_esc_char(input: &str) -> IResult<&str, char> {
	preceded(char('\\'), none_of(r"\{}"))(input)
}

fn arg(input: &str) -> IResult<&str, Arg<'_>> {
	alt((
		map(double, Arg::Lit),
		map(ident, Arg::Var),
		map(s_expr, Arg::SExpr),
		map(word, Arg::Error),
	))(input)
}

fn s_expr(input: &str) -> IResult<&str, SExpr> {
	let (rest, (fn_name, args)) = delimited(
		pair(l_paren, multispace0),
		pair(word, many0(preceded(multispace0, arg))),
		pair(multispace0, r_paren),
	)(input)?;

	Ok((rest, SExpr { fn_name, args }))
}

fn brace_expr(input: &str) -> IResult<&str, BracedExpr<'_>> {
	// This looks needlessly complex — why not “factor out” the `delimited`s and
	// surrounding braces, and place the `alt` inside? I don't fully understand, but
	// nom's `alt` will fail to parse if you do that.
	let (rest, braced) = alt((
		delimited(
			l_brace,
			delimited(
				multispace0,
				alt((map(ident, BracedExpr::Var), map(s_expr, BracedExpr::SExpr))),
				multispace0,
			),
			r_brace,
		),
		delimited(
			l_brace,
			map(opt(is_not("}")), |o| {
				BracedExpr::Error(o.unwrap_or_default())
			}),
			r_brace,
		),
	))(input)?;

	Ok((rest, braced))
}

#[derive(Debug)]
#[cfg_attr(test, derive(PartialEq))]
enum BracedExpr<'a> {
	Var(&'a str),
	SExpr(SExpr<'a>),
	Error(&'a str),
}

#[derive(Debug)]
#[cfg_attr(test, derive(PartialEq))]
enum Arg<'a> {
	Lit(f64),
	Var(&'a str),
	SExpr(SExpr<'a>),
	Error(&'a str),
}

impl Arg<'_> {
	fn eval(
		&self,
		context: &'_ DecodingContext<'_>,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<VariableValue> {
		Ok(match self {
			&Arg::Lit(x) => x.into(),
			&Arg::Var(var) => context.eval_variable(var, variables_referenced)?,
			Arg::SExpr(ex) => ex.eval(context, variables_referenced)?,
			&Arg::Error(e) => {
				return Err(vec![
					VariableEvaluationError::InvalidVariableNameOrExpression(e.to_owned()),
				])
			}
		})
	}
}

#[derive(Debug)]
#[cfg_attr(test, derive(PartialEq))]
struct SExpr<'a> {
	fn_name: &'a str,
	args: Vec<Arg<'a>>,
}

impl SExpr<'_> {
	fn eval(
		&self,
		context: &'_ DecodingContext<'_>,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<VariableValue> {
		let Self { fn_name, args } = self;
		let fn_name = *fn_name;
		let args_iter = args
			.iter()
			.map(|arg| arg.eval(context, variables_referenced));

		let Ok(func) = fn_name.parse::<Function>() else {
			return Err(vec![VariableEvaluationError::UnrecognizedFunctionName(
				fn_name.to_owned(),
			)]);
		};

		func.try_call(args_iter)
			.map_err(Vec::<VariableEvaluationError>::from)
	}
}

pub(crate) fn parse<'a>(
	input: &'a str,
	context: &DecodingContext,
	variables_referenced: &Set<String>,
) -> VariableSubstitutionResult<Cow<'a, str>> {
	if input.is_empty() {
		return Ok(input.into());
	}

	let parsing_errs = RefCell::new(Vec::new());

	let parse_res = all_consuming(many0(alt((
		map(brace_expr, |braced| -> VariableSubstitutionResult<_> {
			Ok(match braced {
				BracedExpr::Var(var) => match context.eval_variable(var, variables_referenced) {
					Ok(x) => Cow::Owned(x.as_str().into_owned()),
					Err(e) => {
						parsing_errs.borrow_mut().extend(e);
						Cow::Borrowed("")
					}
				},
				BracedExpr::SExpr(ex) => {
					Cow::Owned(ex.eval(context, variables_referenced)?.to_string())
				}
				BracedExpr::Error(s) => {
					parsing_errs.borrow_mut().push(
						VariableEvaluationError::InvalidVariableNameOrExpression(s.to_owned()),
					);
					Cow::Borrowed("")
				}
			})
		}),
		map(esc_char, |s| Ok(Cow::Borrowed(s))),
		map(is_not(r"\{}"), |s| Ok(Cow::Borrowed(s))),
		map(invalid_esc_char, |c| {
			parsing_errs
				.borrow_mut()
				.push(VariableEvaluationError::InvalidEscapedChar(c));
			Ok(Cow::Borrowed(""))
		}),
		map(terminated(char('\\'), eof), |_| {
			parsing_errs
				.borrow_mut()
				.push(VariableEvaluationError::TrailingBackslash);
			Ok(Cow::Borrowed(""))
		}),
		map(l_brace, |_| {
			parsing_errs
				.borrow_mut()
				.push(VariableEvaluationError::UnmatchedLeftBrace);
			Ok(Cow::Borrowed(""))
		}),
		map(r_brace, |_| {
			parsing_errs
				.borrow_mut()
				.push(VariableEvaluationError::UnmatchedRightBrace);
			Ok(Cow::Borrowed(""))
		}),
	))))(input);

	let mut parsing_errs = parsing_errs.into_inner();
	let (rest, ans) = match parse_res {
		Ok(x) => x,
		Err(e) => {
			match e {
				nom::Err::Error(e) => {
					parsing_errs.push(VariableEvaluationError::Parsing(e.to_string()));
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

#[cfg(test)]
mod test {
	use super::*;
	use crate::fibroblast::data_types::ConcreteNumber;

	#[test]
	fn test_brace_expr() {
		// Reminder that nom parsers return `(remaining, parsed)`
		assert_eq!(brace_expr("{x}").unwrap(), ("", BracedExpr::Var("x")));
		assert_eq!(
			brace_expr("{ xyz } 123").unwrap(),
			(" 123", BracedExpr::Var("xyz"))
		);
		assert_eq!(
			brace_expr("{(+)} 123").unwrap(),
			(
				" 123",
				BracedExpr::SExpr(SExpr {
					fn_name: "+",
					args: Vec::new()
				})
			)
		);
		assert_eq!(
			brace_expr("{ (min(*(+ a b) (e))0) } 123").unwrap(),
			(
				" 123",
				BracedExpr::SExpr(SExpr {
					fn_name: "min",
					args: vec![
						Arg::SExpr(SExpr {
							fn_name: "*",
							args: vec![
								Arg::SExpr(SExpr {
									fn_name: "+",
									args: vec![Arg::Var("a"), Arg::Var("b")]
								}),
								Arg::SExpr(SExpr {
									fn_name: "e",
									args: vec![]
								})
							]
						}),
						Arg::Lit(0.0)
					]
				}),
			)
		);
	}

	#[test]
	fn test_parse() {
		let vars = [("a", VariableValue::Number(ConcreteNumber::UInt(1)))];
		let context = DecodingContext::new_with_vars(vars.iter().map(|(k, v)| (*k, v)));

		assert_eq!(parse("(+ 1 2)", &context, &Set::new()).unwrap(), "(+ 1 2)");
	}

	#[test]
	fn test_err() {
		#[track_caller]
		fn test_brace_err(input: &str, msg: &str) {
			assert_eq!(brace_expr(input).unwrap().1, BracedExpr::Error(msg));
		}

		test_brace_err("{}", "");
		test_brace_err("{ }", " ");
		test_brace_err("{     }", "     "); // 5 spaces
		test_brace_err("{\n}", "\n");

		test_brace_err("{( }", "( ");
		test_brace_err("{ (}", " (");
		test_brace_err("{)(}", ")(");
		test_brace_err("{) }", ") ");
		test_brace_err("{ )}", " )");

		test_brace_err("{.}", ".");
		test_brace_err("{. }", ". ");
		test_brace_err("{ .}", " .");
		test_brace_err("{ . }", " . ");

		test_brace_err("{a.}", "a.");
		test_brace_err("{.a}", ".a");
		test_brace_err("{a .}", "a .");
		test_brace_err("{a. }", "a. ");
		test_brace_err("{a. a}", "a. a");
		test_brace_err("{. a}", ". a");

		test_brace_err("{()}", "()");
		test_brace_err("{  (+ ())  }", "  (+ ())  ");
		test_brace_err("{  + ())  }", "  + ())  ");
		test_brace_err("{  (+ (+ (+ (+ ()))))  }", "  (+ (+ (+ (+ ()))))  ");
	}
}
