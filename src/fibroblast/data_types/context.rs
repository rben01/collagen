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
use crate::fibroblast::data_types::{ConcreteNumber, Map, MapEntry};
use crate::to_svg::svg_writable::ClgnDecodingResult;
use lazy_static::lazy_static;
use regex::Regex;
use std::borrow::Cow;
use std::cell::{Ref, RefCell};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use strum_macros::EnumString;

lazy_static! {
	static ref VAR_NAME_CHAR_RE: Regex = Regex::new(r"\w").unwrap();
}

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

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug, PartialEq, Eq)]
pub enum VariableSubstitutionError {
	Parse(ParseError),
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
}

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase")]
enum BinaryFunction {
	#[strum(serialize = "-")]
	Sub,
	#[strum(serialize = "/")]
	Div,
	Pow,
	Atan2,
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

#[derive(Debug, EnumString)]
#[strum(serialize_all = "lowercase", ascii_case_insensitive)]
enum NullaryFunction {
	E,
	Pi,
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

	pub(crate) fn new_at_root(root_path: impl AsRef<Path>) -> Self {
		Self::new(root_path.as_ref().to_owned(), Map::new())
	}

	pub(crate) fn replace_root(&self, root: impl AsRef<Path>) -> PathBuf {
		self.root_path.replace(root.as_ref().to_owned())
	}

	pub(crate) fn with_new_root<T>(
		&self,
		new_root: impl AsRef<Path>,
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

	/// Parse an expression between curly braces
	fn parse_expr(
		&self,
		s: &'_ str,
		original_index: usize,
		variables_referenced: BTreeSet<String>,
	) -> Result<VariableValue, Vec<VariableSubstitutionError>> {
		#[derive(Debug, Clone, Copy)]
		enum ArgKind<'c> {
			Lit(f64),
			Var(&'c str),
		}

		#[derive(Debug, Clone, Copy)]
		enum TokenKind<'c> {
			Start,
			Function(&'c str),
			Arg(ArgKind<'c>),
			Error,
		}

		#[derive(Debug, Clone, Copy)]
		struct Token<'c> {
			pos: usize,
			kind: TokenKind<'c>,
		}

		fn eval_arg(
			context: &DecodingContext,
			arg: ArgKind,
			errors: &mut Vec<VariableSubstitutionError>,
			variables_referenced: BTreeSet<String>,
		) -> Result<f64, ()> {
			match arg {
				ArgKind::Lit(num) => Ok(num),
				ArgKind::Var(name) => {
					if !VAR_NAME_CHAR_RE.is_match(name) {
						errors.push(VariableSubstitutionError::InvalidVariableName(
							name.to_owned(),
						));
						Err(())
					} else if variables_referenced.contains(name) {
						errors.push(VariableSubstitutionError::RecursiveSubstitutionError {
							names: variables_referenced
								.iter()
								.map(|s| s.to_owned())
								.chain(std::iter::once(name.to_owned()))
								.collect::<Vec<_>>(),
						});
						Err(())
					} else if let Some(value) = context.get_var(name) {
						match value {
							VariableValue::Number(cn) => Ok(f64::from(*cn)),
							VariableValue::String(value) => {
								let mut variables_referenced = variables_referenced;
								variables_referenced.insert(name.to_owned());
								match context
									.eval_exprs_in_string_helper(value, variables_referenced)
								{
									Ok(s) => match s.parse() {
										Ok(x) => Ok(x),
										Err(_) => {
											errors.push(
									VariableSubstitutionError::ExpectedNumGotStringForVariable {
										name: name.to_owned(),
										value: value.to_owned(),
									},
								);
											Err(())
										}
									},
									Err(e) => {
										errors.extend(e);
										Err(())
									}
								}
							}
						}
					} else {
						errors.push(VariableSubstitutionError::UnknownVariableName(
							name.to_owned(),
						));
						Err(())
					}
				}
			}
		}

		let mut errors = Vec::new();

		let s = s.trim();
		let mut next_special_tok_ends_curr_tok = false;
		let mut left = 0;
		let mut tok_stack = Vec::<Token>::new();

		for (i, c) in s.chars().chain(std::iter::once(' ')).enumerate() {
			match c {
				c if c.is_whitespace() && !next_special_tok_ends_curr_tok => {
					left = i + 1;
				}
				c if c.is_whitespace() || c == '(' || c == ')' => {
					next_special_tok_ends_curr_tok = false;

					let tok_str = &s[left..i];

					if !tok_str.is_empty() {
						let tok_kind = match tok_stack.last() {
							Some(Token {
								pos: _,
								kind: TokenKind::Start,
							}) => TokenKind::Function(tok_str),
							_ => {
								if let Ok(num) = tok_str.parse() {
									TokenKind::Arg(ArgKind::Lit(num))
								} else {
									TokenKind::Arg(ArgKind::Var(tok_str))
								}
							}
						};
						let tok = Token {
							pos: i,
							kind: tok_kind,
						};
						tok_stack.push(tok);
					}

					left = i + 1;

					if c == '(' {
						tok_stack.push(Token {
							pos: original_index + i,
							kind: TokenKind::Start,
						});
					} else if c == ')' {
						let matching_start_pos =
							tok_stack.iter().enumerate().rev().find_map(|(j, tok)| {
								matches!(tok.kind, TokenKind::Start).then_some(j)
							});
						let matching_start_pos = match matching_start_pos {
							Some(pos) => pos,
							None => {
								errors.push(VariableSubstitutionError::Parse(
									ParseError::UnexpectedClosingParen {
										position: original_index + i,
									},
								));
								// This is unrecoverable
								return Err(errors);
							}
						};
						let mut expr_tok_iter = tok_stack[matching_start_pos + 1..].iter();

						let first_tok = match expr_tok_iter.next() {
							Some(tok) => tok,
							None => {
								errors.push(VariableSubstitutionError::EmptyParentheses {
									pos: original_index + i,
								});
								let start = tok_stack.pop().unwrap();
								tok_stack.push(Token {
									pos: start.pos,
									kind: TokenKind::Error,
								});
								continue;
							}
						};

						let res = match first_tok.kind {
							TokenKind::Function(func_name) => {
								if let Ok(func) = func_name.parse::<VariadicFunction>() {
									let init = match func {
										VariadicFunction::Add => 0.0,
										VariadicFunction::Mul => 1.0,
										VariadicFunction::Max => f64::MIN,
										VariadicFunction::Min => f64::MAX,
									};

									expr_tok_iter
										.map(|tok| match tok.kind {
											TokenKind::Arg(arg) => eval_arg(
												self,
												arg,
												&mut errors,
												variables_referenced.clone(),
											),
											TokenKind::Error => Ok(1.0),
											_ => panic!("unexpected token {tok:?}"),
										})
										.fold(Ok(init), |a: Result<f64, ()>, b: Result<f64, ()>| {
											let a = a?;
											let b = b?;

											let res = match func {
												VariadicFunction::Add => a + b,
												VariadicFunction::Mul => a * b,
												VariadicFunction::Max => a.max(b),
												VariadicFunction::Min => a.min(b),
											};
											Ok(res)
										})
								} else if let Ok(func) = func_name.parse::<BinaryFunction>() {
									let first = match expr_tok_iter.next() {
										Some(tok) => match tok.kind {
											TokenKind::Arg(arg) => eval_arg(
												self,
												arg,
												&mut errors,
												variables_referenced.clone(),
											),
											TokenKind::Error => Ok(1.0),
											_ => panic!("unexpected token {tok:?}"),
										},
										None => {
											errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 2, actual: 0 });
											Err(())
										}
									};
									let second = match expr_tok_iter.next() {
										Some(tok) => match tok.kind {
											TokenKind::Arg(arg) => eval_arg(
												self,
												arg,
												&mut errors,
												variables_referenced.clone(),
											),
											TokenKind::Error => Ok(1.0),
											_ => panic!("unexpected token {tok:?}"),
										},
										None => {
											errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 2, actual: 1 });
											Err(())
										}
									};

									let remaining_tokens = expr_tok_iter.count();
									if remaining_tokens != 0 {
										errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 2, actual: 2+remaining_tokens });
										Err(())
									} else {
										first.and_then(|x| {
											second.map(|y| match func {
												BinaryFunction::Sub => x - y,
												BinaryFunction::Div => x / y,
												BinaryFunction::Pow => x.powf(y),
												// a tad confusing; the first argument is the "y" of
												// atan2, the second is the "x" (these arguments are
												// in the correct order)
												BinaryFunction::Atan2 => x.atan2(y),
											})
										})
									}
								} else if let Ok(func) = func_name.parse::<UnaryFunction>() {
									let first = match expr_tok_iter.next() {
										Some(tok) => match tok.kind {
											TokenKind::Arg(arg) => eval_arg(
												self,
												arg,
												&mut errors,
												variables_referenced.clone(),
											),
											TokenKind::Error => Ok(1.0),
											_ => panic!("unexpected token {tok:?}"),
										},
										None => {
											errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 1, actual: 0 });
											Err(())
										}
									};
									let remaining_tokens = expr_tok_iter.count();
									if remaining_tokens != 0 {
										errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 1, actual: 1+remaining_tokens });
										Err(())
									} else {
										first.map(|x| match func {
											UnaryFunction::Exp => x.exp(),
											UnaryFunction::Log => x.ln(),
											UnaryFunction::Log2 => x.log2(),
											UnaryFunction::Sin => x.sin(),
											UnaryFunction::Cos => x.cos(),
											UnaryFunction::Tan => x.tan(),
											UnaryFunction::Asin => x.asin(),
											UnaryFunction::Acos => x.acos(),
											UnaryFunction::Atan => x.atan(),
										})
									}
								} else if let Ok(func) = func_name.parse::<NullaryFunction>() {
									let remaining_tokens = expr_tok_iter.count();
									if remaining_tokens != 0 {
										errors.push(VariableSubstitutionError::WrongNumberOfFunctionArguments { name: func_name.to_owned(), expected: 0, actual: remaining_tokens });
										Err(())
									} else {
										Ok(match func {
											NullaryFunction::E => std::f64::consts::E,
											NullaryFunction::Pi => std::f64::consts::PI,
										})
									}
								} else {
									errors.push(
										VariableSubstitutionError::UnrecognizedFunctionName(
											func_name.to_owned(),
										),
									);
									Err(())
								}
							}
							_ => panic!("logic error: the token following Start was not Function"),
						};

						// Replace tokens comprising this expression with a single token
						// containing the result
						let start_pos = tok_stack[matching_start_pos].pos;
						tok_stack.drain(matching_start_pos..);
						let new_kind = match res {
							Ok(val) => TokenKind::Arg(ArgKind::Lit(val)),
							Err(()) => TokenKind::Error,
						};
						tok_stack.push(Token {
							pos: start_pos,
							kind: new_kind,
						});
					}
				}

				_ => {
					next_special_tok_ends_curr_tok = true;
				}
			}
		}

		match tok_stack.len() {
			0 => {
				errors.push(VariableSubstitutionError::Parse(ParseError::Empty {
					position: original_index,
				}));
			}
			1 => {
				let tok = tok_stack[0];
				match tok.kind {
					TokenKind::Arg(arg) => match arg {
						// we ended up with a number
						ArgKind::Lit(x) => {
							return Ok(VariableValue::Number(ConcreteNumber::Float(x)))
						}
						// a single variable name was provided, which we now have to substitute
						ArgKind::Var(name) => match self.get_var(name) {
							Some(val) => match val {
								VariableValue::Number(cn) => return Ok(VariableValue::Number(*cn)),
								VariableValue::String(s) => {
									let mut variables_referenced = variables_referenced;
									variables_referenced.insert(name.to_owned());
									match self.eval_exprs_in_string_helper(s, variables_referenced)
									{
										Ok(ret) => {
											return Ok(VariableValue::String(ret.into_owned()))
										}
										Err(e) => errors.extend(e),
									}
								}
							},
							None => errors.push(VariableSubstitutionError::UnknownVariableName(
								name.to_owned(),
							)),
						},
					},
					TokenKind::Start => errors.push(VariableSubstitutionError::Parse(
						ParseError::UnclosedParen { position: tok.pos },
					)),
					TokenKind::Error => {}
					TokenKind::Function(_) => panic!("last token on the stack was a function"),
				}
			}
			_ => {
				if let Some(unclosed_paren_pos) =
					tok_stack.iter().enumerate().rev().find_map(|(_, tok)| {
						matches!(tok.kind, TokenKind::Start).then_some(tok.pos)
					}) {
					errors.push(VariableSubstitutionError::Parse(
						ParseError::UnclosedParen {
							position: unclosed_paren_pos,
						},
					));
				} else {
					errors.push(VariableSubstitutionError::Parse(
						ParseError::InvalidExpression {
							expr: s.to_owned(),
							position: original_index,
						},
					));
				}
			}
		}

		Err(errors)
	}

	pub(crate) fn eval_exprs_in_str<'b>(
		&self,
		s: &'b str,
	) -> Result<Cow<'b, str>, Vec<VariableSubstitutionError>> {
		self.eval_exprs_in_string_helper(s, BTreeSet::new())
	}

	fn eval_exprs_in_string_helper<'b>(
		&self,
		s: &'b str,
		variables_referenced: BTreeSet<String>,
	) -> Result<Cow<'b, str>, Vec<VariableSubstitutionError>> {
		#[derive(Debug)]
		enum ParseState {
			Normal,
			InsideBracesValid,
		}
		use ParseState::*;

		let mut errors = Vec::new();

		let mut modified_from_original = false;
		let mut string_result = String::new();

		let mut parse_state = ParseState::Normal;
		let mut prev_was_backslash = false;
		let mut left = 0;
		let mut opening_brace_idx = 0;

		// Don't really know what I'm doing when it comes to parsing, but this works, so
		// ¯\_(ツ)_/¯
		for (i, c) in s.chars().into_iter().enumerate() {
			match (prev_was_backslash, &parse_state, c) {
				// (_, InsideBracesValid | InsideBracesInvalid, '\\') => {
				// 	return Err(VariableSubstitutionError::Parse(BackslashInVariableName {
				// 		position: i,
				// 	}));
				// }
				(false, _, '\\') => {
					prev_was_backslash = true;
				}
				(false, Normal, '{') => {
					string_result.push_str(&s[left..i]);
					left = i + c.len_utf8();
					parse_state = InsideBracesValid;
					opening_brace_idx = i;
				}
				(false, InsideBracesValid, '}') if i > left => {
					modified_from_original = true;

					let expr = &s[left..i];
					match self.parse_expr(expr, opening_brace_idx, variables_referenced.clone()) {
						Ok(x) => {
							string_result.push_str(&x.as_str());
						}
						Err(e) => {
							errors.extend(e);
							string_result.push_str("<<ERROR>>");
						}
					};

					left = i + c.len_utf8();
					parse_state = Normal;
				}
				(false, Normal, '}') => {
					errors.push(VariableSubstitutionError::Parse(
						ParseError::UnexpectedClosingBrace { position: i },
					));
					return Err(errors);
				}
				(true, Normal, '{' | '}' | '\\') => {
					string_result.push_str(&s[left..i - '\\'.len_utf8()]);
					string_result.push(c);

					left = i + c.len_utf8();
					prev_was_backslash = false;
					modified_from_original = true;
				}
				(true, Normal, _) => {
					errors.push(VariableSubstitutionError::Parse(
						ParseError::InvalidEscapeSequence {
							position: (i - 1, i),
							char: c,
						},
					));
					continue;
				}

				_ => {
					// Do nothing; i will advance
				}
			}
		}

		if !errors.is_empty() {
			return Err(errors);
		}

		match (prev_was_backslash, parse_state) {
			(true, _) => errors.push(VariableSubstitutionError::Parse(
				ParseError::EndedWithBackslash,
			)),
			(_, Normal) => {
				string_result.push_str(&s[left..]);
				return Ok(if modified_from_original {
					Cow::Owned(string_result)
				} else {
					Cow::Borrowed(s)
				});
			}
			(_, InsideBracesValid) => errors.push(VariableSubstitutionError::Parse(
				ParseError::UnterminatedVariable {
					content: s[left..].to_string(),
				},
			)),
		}

		Err(errors)
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
	use std::str::FromStr;

	struct Invalid<'a>(Vec<&'a str>);
	struct Missing<'a>(Vec<&'a str>);

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
			let context = DecodingContext::new_at_root("root0");

			assert_eq!(*context.get_root(), Path::new("root0"));

			context
				.with_new_root("root1", || {
					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root2", || {
							assert_eq!(*context.get_root(), Path::new("root2"));
							Ok(())
						})
						.unwrap();

					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root3", || {
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
			use super::ParseError;
			use super::VariableSubstitutionError;
			use super::VariableValue as VV;

			#[track_caller]
			fn test(context: &DecodingContext, s: &str, err: ParseError) {
				assert_eq!(
					context.eval_exprs_in_str(s).unwrap_err(),
					vec![VariableSubstitutionError::Parse(err)]
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

			test(&empty_context, r"\", ParseError::EndedWithBackslash);
			test(&empty_context, r"x\", ParseError::EndedWithBackslash);
			test(
				&empty_context,
				r"xytas\{\}\",
				ParseError::EndedWithBackslash,
			);
			test(
				&nonempty_context,
				r"xytas{d}\",
				ParseError::EndedWithBackslash,
			);
			test(
				&nonempty_context,
				r"\\xytas{a}\\{e}\",
				ParseError::EndedWithBackslash,
			);

			test(
				&empty_context,
				"}",
				ParseError::UnexpectedClosingBrace { position: 0 },
			);
			test(
				&empty_context,
				"xyz}",
				ParseError::UnexpectedClosingBrace { position: 3 },
			);
			test(
				&nonempty_context,
				"{a}{b}}",
				ParseError::UnexpectedClosingBrace { position: 6 },
			);
			test(
				&empty_context,
				"{xyz}6789}ajshd", // Yep, the missing variable is ignored when we can't parse
				ParseError::UnexpectedClosingBrace { position: 9 },
			);

			test(
				&empty_context,
				r"{",
				ParseError::UnterminatedVariable {
					content: "".to_owned(),
				},
			);
			test(
				&empty_context,
				r"{xyz",
				ParseError::UnterminatedVariable {
					content: "xyz".to_owned(),
				},
			);
			test(
				&empty_context,
				r"ak{jh}sd{js", // Again, missing variable ignored when we can't parse
				ParseError::UnterminatedVariable {
					content: "js".to_owned(),
				},
			);

			test(
				&empty_context,
				r"ak{\jh}sd{js", // Again, missing variable ignored when we can't parse
				ParseError::BackslashInVariableName { position: 3 },
			);
			test(
				&empty_context,
				r"ak{xyjh}sd{\js", // Again, missing variable ignored when we can't parse
				ParseError::BackslashInVariableName { position: 11 },
			);

			test(
				&empty_context,
				r"\{\x",
				ParseError::InvalidEscapeSequence {
					position: (2, 3),
					char: 'x',
				},
			);
			test(
				&empty_context,
				r"\\x\|",
				ParseError::InvalidEscapeSequence {
					position: (3, 4),
					char: '|',
				},
			);
		}

		#[test]
		fn missing_vars() {
			#[track_caller]
			fn test(context: &DecodingContext, input: impl AsRef<str>, missing: Missing) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					missing
						.0
						.iter()
						.map(|&s| VariableSubstitutionError::UnknownVariableName(s.to_owned()))
						.collect::<Vec<_>>()
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(
				&empty_context,
				"{missing_var}",
				Missing(vec!["missing_var"]),
			);
			test(&empty_context, "{mv1} {mv2}", Missing(vec!["mv1", "mv2"]));
			test(
				&empty_context,
				"a {mv1} b {mv2} c",
				Missing(vec!["mv1", "mv2"]),
			);

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &xyz_string),
			]);

			test(
				&nonempty_context,
				"{mv1} {mv2}",
				Missing(vec!["mv1", "mv2"]),
			);
			test(&nonempty_context, "{a} {mv2}", Missing(vec!["mv2"]));
			test(
				&nonempty_context,
				"{a} {mv2} {mv2} {mv2}",
				Missing(vec!["mv2", "mv2", "mv2"]),
			);
			test(
				&nonempty_context,
				"{a} {b} {mv1} {mv2}",
				Missing(vec!["mv1", "mv2"]),
			);
			test(
				&nonempty_context,
				"{a} {mv1} {mv1} {mv2} {mv1} {mv2} {mv2} {b} ",
				Missing(vec!["mv1", "mv1", "mv2", "mv1", "mv2", "mv2"]),
			);

			// Not actually missing any
			assert!(nonempty_context.eval_exprs_in_str("{a} {b}").is_ok());
		}

		#[test]
		fn illegal_var_names() {
			#[track_caller]
			fn test(context: &DecodingContext, input: impl AsRef<str>, invalid: Invalid) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					invalid
						.0
						.iter()
						.map(|&s| VariableSubstitutionError::InvalidVariableName(s.to_owned()))
						.collect::<Vec<_>>()
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(&empty_context, "{}", Invalid(vec![""]));
			test(&empty_context, "{ }", Invalid(vec![" "]));
			test(&empty_context, "{\n}", Invalid(vec!["\n"]));
			test(&empty_context, "{ a }", Invalid(vec![" a "]));
			test(&empty_context, "{a.}", Invalid(vec!["a."]));
			test(&empty_context, "{ .}", Invalid(vec![" ."]));

			test(&empty_context, "{} {}", Invalid(vec!["", ""]));
			test(&empty_context, "{ } {}", Invalid(vec![" ", ""]));
			test(&empty_context, "{} { }", Invalid(vec!["", " "]));
			test(&empty_context, "{ } { }", Invalid(vec![" ", " "]));
			test(
				&empty_context,
				"{} { } {  } { a } { a } { b } {}",
				Invalid(vec!["", " ", "  ", " a ", " a ", " b ", ""]),
			);
		}

		#[test]
		fn illegal_and_missing_var_names() {
			#[track_caller]
			fn test(
				context: &DecodingContext,
				input: impl AsRef<str>,
				illegal: Invalid,
				missing: Missing,
			) {
				assert_eq!(
					context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
					illegal
						.0
						.iter()
						.map(|&s| VariableSubstitutionError::InvalidVariableName(s.to_owned()))
						.chain(missing.0.iter().map(|&s| {
							VariableSubstitutionError::UnknownVariableName(s.to_owned())
						}))
						.collect::<Vec<_>>(),
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(
				&empty_context,
				"{} {a}",
				Invalid(vec![""]),
				Missing(vec!["a"]),
			);

			test(
				&empty_context,
				"{} {a}",
				Invalid(vec![""]),
				Missing(vec!["a"]),
			);

			test(
				&empty_context,
				"{} {a} {} {a}",
				Invalid(vec!["", ""]),
				Missing(vec!["a", "a"]),
			);

			test(
				&empty_context,
				"{} {a} { } {b}",
				Invalid(vec!["", " "]),
				Missing(vec!["a", "b"]),
			);

			test(
				&empty_context,
				"{} { a } { } { b }",
				Invalid(vec!["", " a ", " ", " b "]),
				Missing(vec![]),
			);

			test(
				&empty_context,
				"{a} {b} {c} {d}",
				Invalid(vec![]),
				Missing(vec!["a", "b", "c", "d"]),
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
				Invalid(vec!["", ""]),
				Missing(vec![]),
			);

			test(
				&nonempty_context,
				"{} {a} { } {e}",
				Invalid(vec!["", " "]),
				Missing(vec!["e"]),
			);

			test(
				&nonempty_context,
				"{} { a } { } { b }",
				Invalid(vec!["", " a ", " ", " b "]),
				Missing(vec![]),
			);

			test(
				&nonempty_context,
				"{a} {b} { c } { d } {e}",
				Invalid(vec![" c ", " d "]),
				Missing(vec!["e"]),
			);

			assert!(nonempty_context
				.eval_exprs_in_str("{a} {b} {c} {d}")
				.is_ok());
		}
	}
}
