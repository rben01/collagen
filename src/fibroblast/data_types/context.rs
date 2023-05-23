//! This file contains `struct DecodingContext`, a type whose instances hold everything
//! needed to decode an object. This is needed because (AFAICT) `serde` lacks the
//! ability to inject external state into the deserialization process. As a result,
//! objects are deserialied into a state which does not contain all information needed
//! for decoding; supplying the context in which they are being decoded allows one to
//! complete the decoding.
//!
//! Example: paths are specified relative to some "root path" which is determined at
//! runtime and is not (de)serialized. So in order for the full path to be obtained from
//! a deserialized `path`, the root path must also be supplied; only then can decoding
//! proceed.

use super::{AttrKVValueVec, SimpleValue, TagVariables, VariableValue};
use crate::{
	fibroblast::data_types::{ConcreteNumber, Map, MapEntry},
	to_svg::svg_writable::{ClgnDecodingError, ClgnDecodingResult},
};
use nom::{
	character::{
		complete::{alphanumeric1, anychar, none_of, one_of},
		streaming::multispace0,
	},
	multi::{many1, many1_count},
	IResult,
};
use once_cell::sync::Lazy;
use regex::Regex;
use std::{
	borrow::Cow,
	cell::{Ref, RefCell},
	collections::BTreeSet,
	path::PathBuf,
};
use strum_macros::EnumString;

#[derive(Debug, PartialEq, Eq)]
pub enum ParseError {
	EndedWithBackslash,
	UnexpectedClosingBrace {
		position: usize,
	},
	UnterminatedVariable {
		content: String,
	},
	BackslashInVariableName {
		position: usize,
	},
	InvalidEscapeSequence {
		position: (usize, usize),
		char: char,
	},
	UnexpectedClosingParen {
		position: usize,
	},
	UnclosedParen {
		position: usize,
	},
	Empty {
		position: usize,
	},
	InvalidExpression {
		expr: String,
		position: usize,
	},
}

impl std::fmt::Display for ParseError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use ParseError::*;
		match self {
			EndedWithBackslash => write!(f, "Strings may not end with a single backslash"),
			UnexpectedClosingBrace { position } => write!(
				f,
				"Unexpected character at position {}: '}}' without a matching '{{'",
				position,
			),
			UnterminatedVariable { content } => write!(
				f,
				"Unterminated variable; saw {:?} before the string ended",
				content
			),
			BackslashInVariableName { position } => write!(
				f,
				"Unexpected character at position {}; a backslash may not occur in a variable name",
				position
			),
			InvalidEscapeSequence { position, char } => write!(
				f,
				r#"Invalid escape sequence "\{}" at position {:?}"#,
				char, position
			),
			UnexpectedClosingParen { position } => {
				write!(f, "Unexpected closing paren at position {:?}", position)
			}
			UnclosedParen { position } => {
				write!(f, "Unclosed open paren at position {:?}", position)
			}
			Empty { position } => {
				write!(f, "Unexpected empty expression at position {:?}", position)
			}
			InvalidExpression { expr, position } => write!(
				f,
				"Invalid expression {:?} at position {:?}",
				expr, position
			),
		}
	}
}

type VariableSubstitutionResult<T> = Result<T, VariableSubstitutionError>;

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug, PartialEq, Eq)]
pub enum VariableSubstitutionError {
	Parse(ParseError),
	Nom(String),
	InvalidVariableName(String),
	UnknownVariableName(String),
	ExpectedNumGotStringForVariable {
		name: String,
		value: String,
	},
	RecursiveSubstitutionError {
		names: Vec<String>,
	},
	EmptyParentheses {
		pos: usize,
	},
	UnrecognizedFunctionName(String),
	WrongNumberOfFunctionArguments {
		name: String,
		expected: usize,
		actual: usize,
	},
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase")]
enum VariadicFunction {
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,
}

impl VariadicFunction {
	fn call(
		&self,
		args: impl IntoIterator<Item = VariableSubstitutionResult<f64>>,
	) -> VariableSubstitutionResult<f64> {
		use VariadicFunction::*;

		// I assume the optimizer will rewrite this to only have a single `match self` in
		// practice, rather than `1 + args.into_iter().count()`
		let init = match self {
			Add => 0.0,
			Mul => 1.0,
			Max => f64::MIN,
			Min => f64::MAX,
			And => 1.0,
			Or => 0.0,
		};

		args.into_iter().fold(Ok(init), |a, b| {
			let a = a?;
			let b = b?;

			let res = match self {
				Add => a + b,
				Mul => a * b,
				Max => a.max(b),
				Min => a.min(b),
				And => a.min(f64::from(b != 0.0)),
				Or => a.max(f64::from(b != 0.0)),
			};
			Ok(res)
		})
	}
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase")]
enum TernaryFunction {
	#[strum(serialize = "if")]
	IfElse,
}

impl TernaryFunction {
	fn call(
		&self,
		x1: VariableSubstitutionResult<f64>,
		x2: VariableSubstitutionResult<f64>,
		x3: VariableSubstitutionResult<f64>,
	) -> VariableSubstitutionResult<f64> {
		use TernaryFunction::*;

		let x1 = x1?;
		let x2 = x2?;
		let x3 = x3?;

		Ok(match self {
			IfElse => {
				if x1 != 0.0 {
					x2
				} else {
					x3
				}
			}
		})
	}
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase")]
enum BinaryFunction {
	#[strum(serialize = "-")]
	Sub,
	#[strum(serialize = "/")]
	Div,
	#[strum(serialize = "%")]
	Mod,
	Pow,
	Atan2,
	#[strum(serialize = "<")]
	Lt,
	#[strum(serialize = "<=")]
	Le,
	#[strum(serialize = "=")]
	Eq,
	#[strum(serialize = ">")]
	Gt,
	#[strum(serialize = ">=")]
	Ge,
}

impl BinaryFunction {
	fn call(
		&self,
		x: VariableSubstitutionResult<f64>,
		y: VariableSubstitutionResult<f64>,
	) -> VariableSubstitutionResult<f64> {
		use BinaryFunction::*;
		let x = x?;
		let y = y?;
		Ok(match self {
			Sub => x - y,
			Div => x / y,
			Mod => x % y,
			Pow => x.powf(y),
			// a tad confusing; the first argument is the "y" of atan2, the second is
			// the "x"; a.atan2(b) is atan2(b, a), and so these arguments are in the
			// correct order
			Atan2 => x.atan2(y),
			Lt => (x < y).into(),
			Le => (x <= y).into(),
			Eq => (x == y).into(),
			Gt => (x > y).into(),
			Ge => (x >= y).into(),
		})
	}
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase")]
enum UnaryFunction {
	Exp,
	Log,
	Log2,
	Sin,
	Cos,
	Tan,
	Asin,
	Acos,
	Atan,
}

impl UnaryFunction {
	fn call(&self, arg: VariableSubstitutionResult<f64>) -> VariableSubstitutionResult<f64> {
		use UnaryFunction::*;
		arg.map(|x| match self {
			Exp => x.exp(),
			Log => x.ln(),
			Log2 => x.log2(),
			Sin => x.sin(),
			Cos => x.cos(),
			Tan => x.tan(),
			Asin => x.asin(),
			Acos => x.acos(),
			Atan => x.atan(),
		})
	}
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase", ascii_case_insensitive)]
enum NullaryFunction {
	E,
	Pi,
}

impl NullaryFunction {
	fn call(&self) -> f64 {
		match self {
			NullaryFunction::E => std::f64::consts::E,
			NullaryFunction::Pi => std::f64::consts::PI,
		}
	}
}

/// A context in which something can be decoded
///
/// Consists of the root path (for resolving relative paths) and a variable key-value
/// map for performing variable substitution
#[derive(Debug, Clone)]
pub struct DecodingContext<'a> {
	root_path: RefCell<PathBuf>,
	vars_map: RefCell<Map<&'a str, &'a VariableValue>>,
}

impl<'a> DecodingContext<'a> {
	pub(crate) fn new(
		root_path: PathBuf,
		vars_intoiter: impl IntoIterator<Item = (&'a str, &'a VariableValue)>,
	) -> Self {
		let vars_ref_map = vars_intoiter.into_iter().collect();

		Self {
			root_path: RefCell::new(root_path),
			vars_map: RefCell::new(vars_ref_map),
		}
	}

	pub(crate) fn new_at_root(root_path: PathBuf) -> Self {
		Self::new(root_path, Map::new())
	}

	pub(crate) fn replace_root(&self, root: PathBuf) -> PathBuf {
		self.root_path.replace(root)
	}

	pub(crate) fn with_new_root<T>(
		&self,
		new_root: PathBuf,
		f: impl FnOnce() -> ClgnDecodingResult<T>,
	) -> ClgnDecodingResult<T> {
		let orig_path = self.replace_root(new_root);
		let result = f();
		self.replace_root(orig_path);
		result
	}

	pub(crate) fn get_root(&self) -> Ref<PathBuf> {
		self.root_path.borrow()
	}

	/// Append the given variables to self (i.e., introduce them as a nested scope),
	/// call `f()` in this scope. `self` is not mutated.
	///
	/// > Actually `self` *is* mutated via `RefCell`, but only temporarily -- it is
	/// modified to create the correct state for `f` to be called in and then it's
	/// restored to its original state so that it is as if it had never changed at all.
	/// (It might be regarded as "net non-mutating".)
	///
	/// > *CAUTION*: For this reason, this function is almost certainly not thread safe.
	pub(crate) fn with_new_vars<T, F: FnOnce() -> ClgnDecodingResult<T>>(
		&self,
		vars: &TagVariables,
		f: F,
	) -> ClgnDecodingResult<T> {
		// This function requires a little trickery. Since we're adding `&str` keys to
		// `self`'s map, the Rust compiler thinks those keys need to outlive `self`.
		// But, actually, they *don't* need to because `self` is restored to its
		// original state before this function returns; those keys definitely won't be
		// dropped before being removed from the map. But the Rust compiler can't figure
		// this out. Hence the use of `unsafe`.

		let mut orig_vars = Vec::<(&str, Option<&VariableValue>)>::new();

		// Update `my_vars` with `vars`
		let mut my_vars = self.vars_map.borrow_mut();
		for (k, v) in vars.0.iter() {
			// See comment above for why this is (not thread- !) safe. tl;dr the short-lived entries are
			// removed from the map before they have a chance to be dropped
			let k = k.as_ref() as *const str;
			let v = v as *const VariableValue;
			unsafe {
				let entry = my_vars.entry(&*k);
				match entry {
					MapEntry::Occupied(mut occ) => {
						orig_vars.push((&*k, Some(occ.insert(&*v))));
					}
					MapEntry::Vacant(vac) => {
						orig_vars.push((&*k, None));
						vac.insert(&*v);
					}
				}
			}
		}

		// Remove the borrow_mut while f executes, since f may need it itself
		drop(my_vars);

		let result = f();

		// Re-borrow_mut to restore to original state
		let mut my_vars = self.vars_map.borrow_mut();
		for (k, v) in orig_vars {
			match v {
				Some(v) => my_vars.insert(k, v),
				None => my_vars.remove(k),
			}
			.unwrap(); // Panic if we had a logic error and a key somehow wasn't present
		}

		result
	}

	pub(crate) fn get_var(&self, var: &str) -> Option<&'a VariableValue> {
		// Nothing is really copied here; self.vars_map.borrow().get(var) returns a
		// double reference `&&T`, which we just want to turn into a `&T` (so, sure, a
		// pointer is copied. NBD)
		self.vars_map.borrow().get(var).copied()
	}

	pub(crate) fn eval_exprs_in_str<'b>(
		&self,
		s: &'b str,
	) -> VariableSubstitutionResult<Cow<'b, str>> {
		self.eval_exprs_in_string_helper_2(s, &BTreeSet::new())
	}

	fn eval_exprs_in_string_helper_2<'b>(
		&self,
		s: &'b str,
		variables_referenced: &BTreeSet<String>,
	) -> VariableSubstitutionResult<Cow<'b, str>> {
		use nom::{
			branch::alt,
			bytes::complete::{is_not, take_till1, take_while},
			character::complete::{alpha1, alphanumeric0, char, multispace0, multispace1, satisfy},
			combinator::{cut, map, not, recognize},
			multi::{many0, many0_count, separated_list0},
			number::complete::double,
			sequence::{delimited, pair, tuple},
		};

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
				variables_referenced: &BTreeSet<String>,
			) -> VariableSubstitutionResult<f64> {
				Ok(match self {
					Arg::Lit(x) => *x,
					Arg::Var(var) => {
						let var = *var;
						if variables_referenced.contains(var) {
							return Err(VariableSubstitutionError::RecursiveSubstitutionError {
								names: vec![var.to_owned()],
							});
						}
						let val = context.get_var(var).ok_or_else(|| {
							VariableSubstitutionError::UnknownVariableName(var.into())
						})?;
						match val {
							VariableValue::Number(x) => f64::from(*x),
							VariableValue::String(s) => {
								let mut variables_referenced = variables_referenced.clone();
								variables_referenced.insert(var.to_owned());
								let res = context
									.eval_exprs_in_string_helper_2(s, &variables_referenced)?;
								if let Ok(x) = res.parse() {
									x
								} else {
									return Err(
										VariableSubstitutionError::ExpectedNumGotStringForVariable {
											 name: var.to_owned(),
											 value: res.into_owned()
											}
);
								}
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
				variables_referenced: &BTreeSet<String>,
			) -> VariableSubstitutionResult<f64> {
				let Self { fn_name, args } = self;
				let fn_name = *fn_name;
				let mut args_iter = args
					.iter()
					.map(|arg| arg.eval(context, variables_referenced));
				Ok(if let Ok(func) = fn_name.parse::<VariadicFunction>() {
					func.call(args_iter)?
				} else if let Ok(func) = fn_name.parse::<TernaryFunction>() {
					let expected_n_args = 3;
					if args.len() != expected_n_args {
						return Err(VariableSubstitutionError::WrongNumberOfFunctionArguments {
							name: fn_name.to_owned(),
							expected: expected_n_args,
							actual: args.len(),
						});
					}
					func.call(
						args_iter.next().unwrap(),
						args_iter.next().unwrap(),
						args_iter.next().unwrap(),
					)?
				} else if let Ok(func) = fn_name.parse::<BinaryFunction>() {
					let expected_n_args = 2;
					if args.len() != expected_n_args {
						return Err(VariableSubstitutionError::WrongNumberOfFunctionArguments {
							name: fn_name.to_owned(),
							expected: expected_n_args,
							actual: args.len(),
						});
					}
					func.call(args_iter.next().unwrap(), args_iter.next().unwrap())?
				} else if let Ok(func) = fn_name.parse::<UnaryFunction>() {
					let expected_n_args = 1;
					if args.len() != expected_n_args {
						return Err(VariableSubstitutionError::WrongNumberOfFunctionArguments {
							name: fn_name.to_owned(),
							expected: expected_n_args,
							actual: args.len(),
						});
					}
					func.call(args_iter.next().unwrap())?
				} else if let Ok(func) = fn_name.parse::<NullaryFunction>() {
					let expected_n_args = 0;
					if args.len() != expected_n_args {
						return Err(VariableSubstitutionError::WrongNumberOfFunctionArguments {
							name: fn_name.to_owned(),
							expected: expected_n_args,
							actual: args.len(),
						});
					}
					func.call()
				} else {
					return Err(VariableSubstitutionError::UnrecognizedFunctionName(
						fn_name.to_owned(),
					));
				})
			}
		}

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

		fn special_char(input: &str) -> IResult<&str, char> {
			one_of("(){}")(input)
		}

		fn ident(input: &str) -> IResult<&str, &str> {
			recognize(pair(
				satisfy(|c| c.is_alphabetic() || c == '_'),
				many0_count(satisfy(|c| c.is_alphanumeric() || c == '_')),
			))(input)
		}

		fn arg(input: &str) -> IResult<&str, Arg<'_>> {
			alt((
				map(double, Arg::Lit),
				map(ident, Arg::Var),
				map(s_expr, Arg::SExpr),
			))(input)
		}

		fn fn_name(input: &str) -> IResult<&str, &str> {
			is_not("(){} \t\n\r")(input)
		}

		fn s_expr(input: &str) -> IResult<&str, SExpr> {
			let (rest, (_, _, fn_name, args, _, _)) = tuple((
				l_paren,
				multispace0,
				fn_name,
				many0(map(pair(multispace1, arg), |(_, arg)| arg)),
				multispace0,
				r_paren,
			))(input)?;

			Ok((rest, SExpr { fn_name, args }))
		}

		fn brace_expr(input: &str) -> IResult<&str, BracedExpr<'_>> {
			let (rest, (_, _, braced, _, _)) = tuple((
				l_brace,
				multispace0,
				alt((map(ident, BracedExpr::Var), map(s_expr, BracedExpr::SExpr))),
				multispace0,
				r_brace,
			))(input)?;

			Ok((rest, braced))
		}

		fn parse<'a>(
			input: &'a str,
			context: &DecodingContext,
			variables_referenced: &BTreeSet<String>,
		) -> VariableSubstitutionResult<Cow<'a, str>> {
			let (rest, ans) = recognize(cut(many0(alt((
				map(brace_expr, |braced| {
					VariableSubstitutionResult::Ok(match braced {
						BracedExpr::Var(var) => {
							let val = context.get_var(var).ok_or_else(|| {
								VariableSubstitutionError::UnknownVariableName(var.into())
							})?;
							match val {
								VariableValue::Number(x) => Cow::Owned(x.to_string()),
								VariableValue::String(s) => {
									let mut variables_referenced = variables_referenced.clone();
									variables_referenced.insert(s.clone());
									context
										.eval_exprs_in_string_helper_2(s, &variables_referenced)?
								}
							}
						}
						BracedExpr::SExpr(ex) => {
							println!("{:?}", ex.eval(context, variables_referenced));
							Cow::Owned(ex.eval(context, variables_referenced)?.to_string())
						}
					})
				}),
				map(recognize(none_of("(){} \t\n\r")), |s: &str| {
					Ok(Cow::Borrowed(s))
				}),
			)))))(input)
			.map_err(|e| VariableSubstitutionError::Nom(e.to_string()))?;

			assert!(rest.is_empty());
			Ok(ans.into())
		}

		parse(s, self, variables_referenced)
	}

	pub(crate) fn sub_vars_into_attrs<I>(
		&'a self,
		attrs: I,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>>
	where
		I: IntoIterator<Item = (&'a str, Cow<'a, SimpleValue>)>,
	{
		let attrs_iter = attrs.into_iter();
		let n_attrs = match attrs_iter.size_hint() {
			(_, Some(upper)) => upper,
			(lower, _) => lower,
		};
		let mut subd_attrs = Vec::with_capacity(n_attrs);

		for (k, orig_val) in attrs_iter {
			let new_val = match orig_val.as_ref() {
				SimpleValue::Text(text) => {
					let subd_text = self.eval_exprs_in_str(text)?;
					match subd_text {
						Cow::Owned(s) => Cow::Owned(SimpleValue::Text(s)),
						_orig_text => orig_val,
					}
				}
				_wasnt_text => orig_val,
			};

			subd_attrs.push((k, new_val));
		}

		Ok(AttrKVValueVec(subd_attrs))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::fibroblast::data_types::{ConcreteNumber as CN, VariableValue as VV};
	use std::{path::Path, str::FromStr};

	impl From<ParseError> for VariableSubstitutionError {
		fn from(value: ParseError) -> Self {
			Self::Parse(value)
		}
	}

	enum BadVarReason {
		Invalid,
		Missing,
	}
	struct BadVar<'a>(BadVarReason, &'a str);
	impl<'a> BadVar<'a> {
		fn invalid(var: &'a str) -> Self {
			Self(BadVarReason::Invalid, var)
		}
		fn missing(var: &'a str) -> Self {
			Self(BadVarReason::Missing, var)
		}
	}

	impl<'a> DecodingContext<'a> {
		pub(crate) fn new_empty() -> Self {
			Self::new(PathBuf::from_str("").unwrap(), Map::new())
		}

		pub(crate) fn new_with_vars<I: IntoIterator<Item = (&'a str, &'a VariableValue)>>(
			vars_intoiter: I,
		) -> Self {
			Self::new(PathBuf::from_str("").unwrap(), vars_intoiter)
		}

		pub(crate) fn vars_map(&self) -> Ref<Map<&str, &VariableValue>> {
			self.vars_map.borrow()
		}
	}

	mod vars {
		use super::*;
		use std::iter::FromIterator;

		#[test]
		fn empty() {
			let context = DecodingContext::new_empty();

			assert_eq!(context.vars_map().len(), 0);

			let v1 = context.get_var("");
			assert!(v1.is_none());

			let v2 = context.get_var("x");
			assert!(v2.is_none());
		}

		#[test]
		fn nonempty() {
			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &xyz_string),
			]);

			assert_eq!(context.vars_map().len(), 4);

			assert_eq!(context.get_var("a"), Some(&VV::Number(CN::Int(1))));
			assert_eq!(context.get_var("b"), Some(&VV::Number(CN::UInt(2))));
			assert_eq!(context.get_var("c"), Some(&VV::Number(CN::Float(3.0))));
			assert_eq!(context.get_var("d"), Some(&VV::String(xyz_ref.to_string())));
		}

		#[test]
		fn with_new_vars() {
			let xyz_ref = "xyz";

			// Suffix `_n` denotes depth n of nested scopes
			let a_val_0 = VV::Number(CN::Int(1));
			let b_val_0 = VV::Number(CN::UInt(2));
			let c_val_0 = VV::String(xyz_ref.to_string());
			let context = DecodingContext::new_with_vars(vec![
				("a", &a_val_0),
				("b", &b_val_0),
				("c", &c_val_0),
			]);

			let assert_unchanged_0 = || {
				assert_eq!(context.get_var("a"), Some(&a_val_0));
				assert_eq!(context.get_var("b"), Some(&b_val_0));
				assert_eq!(context.get_var("c"), Some(&c_val_0));
			};
			assert_unchanged_0();

			let empty_new_vars = TagVariables(Map::new());
			context
				.with_new_vars(&empty_new_vars, || {
					assert_eq!(context.get_var("a"), Some(&a_val_0));
					assert_eq!(context.get_var("b"), Some(&b_val_0));
					assert_eq!(context.get_var("c"), Some(&c_val_0));

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();

			// For the sake of the discerning the outcome of the test, no two values should be equal
			let a_val_1 = VV::Number(CN::UInt(3));
			let d_val_1 = VV::String("added_value".to_string());
			let nonempty_new_vars = TagVariables(Map::from_iter(vec![
				("a".to_owned(), a_val_1.clone()),
				("d".to_owned(), d_val_1.clone()),
			]));
			context
				.with_new_vars(&nonempty_new_vars, || {
					assert_eq!(context.get_var("a"), Some(&a_val_1));
					assert_eq!(context.get_var("b"), Some(&b_val_0));
					assert_eq!(context.get_var("c"), Some(&c_val_0));
					assert_eq!(context.get_var("d"), Some(&d_val_1));

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();

			// Test another level of nesting, repeated `with_new_vars` calls, etc
			context
				.with_new_vars(&nonempty_new_vars, || {
					let assert_unchanged_1 = || {
						assert_eq!(context.get_var("a"), Some(&a_val_1));
						assert_eq!(context.get_var("b"), Some(&b_val_0));
						assert_eq!(context.get_var("c"), Some(&c_val_0));
					};

					let a_val_2 = VV::String("this is a_val_3".to_owned());
					let c_val_2 = VV::Number(CN::Float(5.5));
					let nonempty_new_vars_2 = TagVariables(Map::from_iter(vec![
						("a".to_owned(), a_val_2.clone()),
						("b".to_owned(), b_val_0.clone()),
						("c".to_owned(), c_val_2.clone()),
					]));

					context
						.with_new_vars(&nonempty_new_vars_2, || {
							assert_eq!(context.get_var("a"), Some(&a_val_2));
							assert_eq!(context.get_var("b"), Some(&b_val_0));
							assert_eq!(context.get_var("c"), Some(&c_val_2));
							assert_eq!(context.get_var("d"), Some(&d_val_1));

							Ok(())
						})
						.unwrap();
					assert_unchanged_1();

					context
						.with_new_vars(&nonempty_new_vars_2, || {
							assert_eq!(context.get_var("a"), Some(&a_val_2));
							assert_eq!(context.get_var("b"), Some(&b_val_0));
							assert_eq!(context.get_var("c"), Some(&c_val_2));
							assert_eq!(context.get_var("d"), Some(&d_val_1));

							Ok(())
						})
						.unwrap();
					assert_unchanged_1();

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();
		}
	}

	mod root {
		use super::*;

		#[test]
		fn with_new() {
			let context = DecodingContext::new_at_root("root0".into());

			assert_eq!(*context.get_root(), Path::new("root0"));

			context
				.with_new_root("root1".into(), || {
					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root2".into(), || {
							assert_eq!(*context.get_root(), Path::new("root2"));
							Ok(())
						})
						.unwrap();

					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root3".into(), || {
							assert_eq!(*context.get_root(), Path::new("root3"));
							Ok(())
						})
						.unwrap();

					assert_eq!(*context.get_root(), Path::new("root1"));

					Ok(())
				})
				.unwrap();

			assert_eq!(*context.get_root(), Path::new("root0"));
		}
	}

	mod substitution {
		use super::*;

		#[test]
		fn ok() {
			let empty_context = DecodingContext::new_empty();
			assert_eq!(empty_context.eval_exprs_in_str("").unwrap(), "");
			assert_eq!(empty_context.eval_exprs_in_str("xyz").unwrap(), "xyz");

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars([
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &VV::Number(CN::Float(4.5))),
				("e", &xyz_string),
			]);
			assert_eq!(nonempty_context.eval_exprs_in_str("").unwrap(), "");
			assert_eq!(nonempty_context.eval_exprs_in_str("xyz").unwrap(), "xyz");

			assert_eq!(nonempty_context.eval_exprs_in_str(" {a} ").unwrap(), " 1 ");

			// Something to note is that floats with 0 fractional part are written as if
			// they were ints, e.g., 10.0 becomes "10", not "10.0"
			assert_eq!(
				nonempty_context
					.eval_exprs_in_str("{a}; {b}; {c}; {d}; {e}")
					.unwrap(),
				"1; 2; 3; 4.5; xyz"
			);

			// Backslashes
			assert_eq!(empty_context.eval_exprs_in_str(r"\\").unwrap(), r"\");
			assert_eq!(empty_context.eval_exprs_in_str(r"\{").unwrap(), r"{");
			assert_eq!(empty_context.eval_exprs_in_str(r"\}").unwrap(), r"}");
			assert_eq!(empty_context.eval_exprs_in_str(r"\\\{").unwrap(), r"\{");
			assert_eq!(empty_context.eval_exprs_in_str(r"\\\}").unwrap(), r"\}");
			assert_eq!(empty_context.eval_exprs_in_str(r"\{\}").unwrap(), r"{}");
			assert_eq!(empty_context.eval_exprs_in_str(r"\\\\").unwrap(), r"\\");
			assert_eq!(
				empty_context.eval_exprs_in_str(r"\\\\\{\\\\\\").unwrap(),
				r"\\{\\\"
			);

			// Math
			assert_eq!(
				nonempty_context.eval_exprs_in_str("{(+ a b)}").unwrap(),
				"3"
			);
			assert_eq!(
				nonempty_context
					.eval_exprs_in_str("{(+ a b)} { ( / (   +   d   a   a   a ) c ) }")
					.unwrap(),
				"3 2.5"
			);
			assert_eq!(
				nonempty_context
					.eval_exprs_in_str("{(max a b c d)}")
					.unwrap(),
				nonempty_context.eval_exprs_in_str("{d}").unwrap()
			);
			assert_eq!(
				nonempty_context
					.eval_exprs_in_str("{(min a b c d)}")
					.unwrap(),
				nonempty_context.eval_exprs_in_str("{a}").unwrap()
			);
			assert!(
				(nonempty_context
					.eval_exprs_in_str("{(pi)}")
					.unwrap()
					.parse::<f64>()
					.unwrap() - std::f64::consts::PI)
					.abs() < 1e-10
			);
			assert!(
				(nonempty_context
					.eval_exprs_in_str("{(e)}")
					.unwrap()
					.parse::<f64>()
					.unwrap() - std::f64::consts::E)
					.abs() < 1e-10
			);
			assert_eq!(
				nonempty_context
					.eval_exprs_in_str("abc {(/(*(tan(atan2(pi)(exp 2)))(pow (e) 2))2)} xyz")
					.unwrap(),
				"abc 1.5707963267948963 xyz" // pi/2 to within FP error
			);

			// {
			// 	let s1 = VV::String("{b}".into());
			// 	let s2 = VV::String("{(+ a 1)}".into());
			// 	let circular_context = DecodingContext::new_with_vars([("a", &s1), ("b", &s2)]);
			// 	assert!(circular_context.eval_exprs_in_string("{a}").is_err());
			// }
		}

		#[test]
		fn parse_errors() {
			use super::{ParseError, VariableSubstitutionError, VariableValue as VV};

			#[track_caller]
			fn test<T, V>(context: &DecodingContext, s: &str, err: V)
			where
				T: Into<VariableSubstitutionError>,
				V: Into<Vec<T>>,
			{
				assert_eq!(
					context.eval_exprs_in_str(s).unwrap_err(),
					err.into().into_iter().map(|e| e.into()).collect::<Vec<_>>()
				);
			}

			let empty_context = DecodingContext::new_empty();

			let val_d = VV::String(r"\".to_owned());
			let val_e = VV::String(r"\{}".to_owned());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &val_d),
				("e", &val_e),
			]);

			test(&empty_context, r"\", [ParseError::EndedWithBackslash]);
			test(&empty_context, r"x\", [ParseError::EndedWithBackslash]);
			test(
				&empty_context,
				r"xytas\{\}\",
				[ParseError::EndedWithBackslash],
			);
			test(
				&nonempty_context,
				r"xytas{d}\",
				[ParseError::EndedWithBackslash],
			);
			test(
				&nonempty_context,
				r"\\xytas{a}\\{e}\",
				[ParseError::UnexpectedClosingBrace { position: 2 }],
			);

			test(
				&empty_context,
				"}",
				[ParseError::UnexpectedClosingBrace { position: 0 }],
			);
			test(
				&empty_context,
				"xyz}",
				[ParseError::UnexpectedClosingBrace { position: 3 }],
			);
			test(
				&nonempty_context,
				"{a}{b}}",
				[ParseError::UnexpectedClosingBrace { position: 6 }],
			);
			test(
				&empty_context,
				"{xyz}6789}ajshd",
				[
					VariableSubstitutionError::UnknownVariableName("xyz".into()),
					ParseError::UnexpectedClosingBrace { position: 9 }.into(),
				],
			);

			test(
				&empty_context,
				r"{",
				[ParseError::UnterminatedVariable {
					content: "".to_owned(),
				}],
			);
			test(
				&empty_context,
				r"{xyz",
				[ParseError::UnterminatedVariable {
					content: "xyz".to_owned(),
				}],
			);
			test(
				&empty_context,
				r"ak{jh}sd{js",
				[
					VariableSubstitutionError::UnknownVariableName("jh".into()),
					ParseError::UnterminatedVariable {
						content: "js".to_owned(),
					}
					.into(),
				],
			);

			test(
				&empty_context,
				r"ak{\jh}sd{js",
				[
					VariableSubstitutionError::Parse(ParseError::InvalidEscapeSequence {
						position: (3, 4),
						char: 'j',
					}),
					VariableSubstitutionError::InvalidVariableName("\\jh".into()),
					ParseError::UnterminatedVariable {
						content: "js".into(),
					}
					.into(),
				],
			);
			test(
				&empty_context,
				r"ak{xyjh}sd{\Ks",
				[
					VariableSubstitutionError::UnknownVariableName("xyjh".into()),
					VariableSubstitutionError::Parse(ParseError::InvalidEscapeSequence {
						position: (11, 12),
						char: 'K',
					}),
					ParseError::UnterminatedVariable {
						content: "\\Ks".into(),
					}
					.into(),
				],
			);

			test(
				&empty_context,
				r"\{\x",
				[ParseError::InvalidEscapeSequence {
					position: (2, 3),
					char: 'x',
				}],
			);
			test(
				&empty_context,
				r"\\x\|",
				[ParseError::InvalidEscapeSequence {
					position: (3, 4),
					char: '|',
				}],
			);
		}

		#[test]
		fn missing_vars() {
			#[track_caller]
			fn test<'a>(
				context: &DecodingContext,
				input: impl AsRef<str>,
				missing: impl Into<Vec<&'a str>>,
			) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					missing
						.into()
						.into_iter()
						.map(|s| VariableSubstitutionError::UnknownVariableName(s.to_owned()))
						.collect::<Vec<_>>()
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(&empty_context, "{missing_var}", ["missing_var"]);
			test(&empty_context, "{mv1} {mv2}", ["mv1", "mv2"]);
			test(&empty_context, "a {mv1} b {mv2} c", ["mv1", "mv2"]);

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &xyz_string),
			]);

			test(&nonempty_context, "{mv1} {mv2}", ["mv1", "mv2"]);
			test(&nonempty_context, "{a} {mv2}", ["mv2"]);
			test(
				&nonempty_context,
				"{a} {mv2} {mv2} {mv2}",
				["mv2", "mv2", "mv2"],
			);
			test(&nonempty_context, "{a} {b} {mv1} {mv2}", ["mv1", "mv2"]);
			test(
				&nonempty_context,
				"{a} {mv1} {mv1} {mv2} {mv1} {mv2} {mv2} {b} ",
				["mv1", "mv1", "mv2", "mv1", "mv2", "mv2"],
			);

			// Not actually missing any
			assert!(nonempty_context.eval_exprs_in_str("{a} {b}").is_ok());
		}

		#[test]
		fn illegal_var_names() {
			#[track_caller]
			fn test<'a>(
				context: &DecodingContext,
				input: impl AsRef<str>,
				invalid: impl Into<Vec<&'a str>>,
			) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					invalid
						.into()
						.into_iter()
						.map(|s| VariableSubstitutionError::InvalidVariableName(s.to_owned()))
						.collect::<Vec<_>>()
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(&empty_context, "{}", [""]);
			test(&empty_context, "{ }", [" "]);
			test(&empty_context, "{\n}", ["\n"]);
			test(&empty_context, "{ a }", [" a "]);
			test(&empty_context, "{a.}", ["a."]);
			test(&empty_context, "{ .}", [" ."]);

			test(&empty_context, "{} {}", ["", ""]);
			test(&empty_context, "{ } {}", [" ", ""]);
			test(&empty_context, "{} { }", ["", " "]);
			test(&empty_context, "{ } { }", [" ", " "]);
			test(
				&empty_context,
				"{} { } {  } { a } { a } { b } {}",
				["", " ", "  ", " a ", " a ", " b ", ""],
			);
		}

		#[test]
		fn illegal_and_missing_var_names() {
			#[track_caller]
			fn test<'a>(
				context: &DecodingContext,
				input: impl AsRef<str>,
				vars: impl Into<Vec<BadVar<'a>>>,
			) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					vars.into()
						.into_iter()
						.map(|BadVar(reason, var)| {
							let var = var.to_owned();
							match reason {
								BadVarReason::Invalid => {
									VariableSubstitutionError::InvalidVariableName(var)
								}
								BadVarReason::Missing => {
									VariableSubstitutionError::UnknownVariableName(var)
								}
							}
						})
						.collect::<Vec<_>>(),
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(
				&empty_context,
				"{} {a}",
				[BadVar::invalid(""), BadVar::missing("a")],
			);

			test(
				&empty_context,
				"{} {a}",
				[BadVar::invalid(""), BadVar::missing("a")],
			);

			test(
				&empty_context,
				"{} {a} {} {a}",
				[
					BadVar::invalid(""),
					BadVar::missing("a"),
					BadVar::invalid(""),
					BadVar::missing("a"),
				],
			);

			test(
				&empty_context,
				"{} {a} { } {    } {b}",
				[
					BadVar::invalid(""),
					BadVar::missing("a"),
					BadVar::invalid(" "),
					BadVar::invalid("    "),
					BadVar::missing("b"),
				],
			);

			test(
				&empty_context,
				"{} { a } { } { b }",
				[
					BadVar::invalid(""),
					BadVar::invalid(" a "),
					BadVar::invalid(" "),
					BadVar::invalid(" b "),
				],
			);

			test(
				&empty_context,
				"{a} {b} {c} {d}",
				[
					BadVar::missing("a"),
					BadVar::missing("b"),
					BadVar::missing("c"),
					BadVar::missing("d"),
				],
			);

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &xyz_string),
			]);

			test(
				&nonempty_context,
				"{} {a} {} {a}",
				[BadVar::invalid(""), BadVar::invalid("")],
			);

			test(
				&nonempty_context,
				"{} {a} { } {e}",
				[
					BadVar::invalid(""),
					BadVar::invalid(" "),
					BadVar::missing("e"),
				],
			);

			test(
				&nonempty_context,
				"{} { a } { } { b }",
				[
					BadVar::invalid(""),
					BadVar::invalid(" a "),
					BadVar::invalid(" "),
					BadVar::invalid(" b "),
				],
			);

			test(
				&nonempty_context,
				"{a} {b} { c } { d } {e}",
				[
					BadVar::invalid(" c "),
					BadVar::invalid(" d "),
					BadVar::missing("e"),
				],
			);

			assert!(nonempty_context
				.eval_exprs_in_str("{a} {b} {c} {d}")
				.is_ok());
		}
	}
}
