use std::borrow::Cow;

/// This file contains the functionsZ
use super::DecodingContext;
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
	static ref VAR_NAME_CHAR_RE: Regex = Regex::new(r"\w").unwrap();
}

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum VariableSubstitutionError {
	VariableNameError {
		illegal_names: Vec<String>,
		missing_from_context: Vec<String>,
	},
	UnterminatedVariableName(String),
}

#[cfg(test)]
impl VariableSubstitutionError {
	fn new_with_missing_vars(var_names: Vec<String>) -> Self {
		VariableSubstitutionError::VariableNameError {
			illegal_names: vec![],
			missing_from_context: var_names,
		}
	}

	fn new_with_illegal_names(var_names: Vec<String>) -> Self {
		VariableSubstitutionError::VariableNameError {
			illegal_names: var_names,
			missing_from_context: vec![],
		}
	}
}

pub(super) fn do_variable_substitution<'a>(
	s: &'a str,
	context: &DecodingContext,
) -> Result<Cow<'a, str>, VariableSubstitutionError> {
	enum ParseState {
		Normal,
		InsideBracesValid,
		InsideBracesInvalid,
	}
	use ParseState::*;

	let mut did_make_subn = false;
	let mut string_result = String::new();

	let mut parse_state = ParseState::Normal;
	let mut prev_was_backslash = false;
	let mut left = 0;

	let mut missing_var_names = vec![];
	let mut illegal_var_names = vec![];

	// Don't really know what I'm doing when it comes to parsing, but this works, so
	// ¯\_(ツ)_/¯
	for (i, c) in s.chars().into_iter().enumerate() {
		match (prev_was_backslash, &parse_state, c) {
			(false, _, '\\') => {
				prev_was_backslash = true;
			}
			(false, Normal, '{') => {
				string_result.push_str(&s[left..i]);
				left = i + c.len_utf8();
				parse_state = InsideBracesValid;
			}
			(false, InsideBracesValid, '}') if i > left => {
				did_make_subn = true;

				let var_name = &s[left..i];
				let var_value = context.get_var(var_name);
				match var_value {
					Some(var_value) => string_result.push_str(&var_value.as_str()),
					None => missing_var_names.push(var_name.to_owned()),
				}

				left = i + c.len_utf8();
				parse_state = Normal;
			}
			(false, _, '}') => {
				illegal_var_names.push(s[left..i].to_string());
				parse_state = Normal;
			}
			(false, InsideBracesValid, c) if !VAR_NAME_CHAR_RE.is_match(&c.to_string()) => {
				parse_state = InsideBracesInvalid;
			}

			(true, Normal, '{' | '\\') => {
				let i = i - '\\'.len_utf8();
				string_result.push_str(&s[left..i]);
				left = i + c.len_utf8();
				prev_was_backslash = false;
			}
			_ => {}
		}
	}

	match parse_state {
		Normal => {
			if !missing_var_names.is_empty() || !illegal_var_names.is_empty() {
				Err(VariableSubstitutionError::VariableNameError {
					illegal_names: illegal_var_names,
					missing_from_context: missing_var_names,
				})
			} else {
				string_result.push_str(&s[left..]);
				Ok(if did_make_subn {
					Cow::Owned(string_result)
				} else {
					Cow::Borrowed(s)
				})
			}
		}
		InsideBracesValid | InsideBracesInvalid => Err(
			VariableSubstitutionError::UnterminatedVariableName(s[left..].to_string()),
		),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	use super::super::data_types::{ConcreteNumber as CN, VariableValue as VV};

	#[test]
	fn ok() {
		let empty_context = DecodingContext::new_empty();
		assert_eq!(do_variable_substitution("", &empty_context).unwrap(), "");
		assert_eq!(
			do_variable_substitution("xyz", &empty_context).unwrap(),
			"xyz"
		);

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &VV::Number(CN::UInt(2))),
			("c", &VV::Number(CN::Float(3.0))),
			("d", &VV::Number(CN::Float(4.5))),
			("e", &xyz_string),
		]);
		assert_eq!(do_variable_substitution("", &nonempty_context).unwrap(), "");
		assert_eq!(
			do_variable_substitution("xyz", &nonempty_context).unwrap(),
			"xyz"
		);

		assert_eq!(
			do_variable_substitution(" {a} ", &nonempty_context).unwrap(),
			" 1 "
		);

		// Something to note is that floats with 0 fractional part are written as if
		// they were ints, e.g., 10.0 becomes "10", not "10.0"
		assert_eq!(
			do_variable_substitution("{a}; {b}; {c}; {d}; {e}", &nonempty_context).unwrap(),
			"1; 2; 3; 4.5; xyz"
		);
	}

	#[test]
	fn missing_vars() {
		macro_rules! test {
			($input:expr, $missing_vars:expr, $context:expr $(,)?) => {
				assert_eq!(
					do_variable_substitution($input, $context).err().unwrap(),
					VariableSubstitutionError::new_with_missing_vars(
						($missing_vars).iter().map(|&s| s.to_owned()).collect()
					)
				)
			};
		}

		let empty_context = DecodingContext::new_empty();

		test!("{missing_var}", vec!["missing_var"], &empty_context);
		test!("{mv1} {mv2}", vec!["mv1", "mv2"], &empty_context);
		test!("a {mv1} b {mv2} c", vec!["mv1", "mv2"], &empty_context);

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &xyz_string),
		]);

		test!("{mv1} {mv2}", vec!["mv1", "mv2"], &nonempty_context);
		test!("{a} {mv2}", vec!["mv2"], &nonempty_context);
		test!(
			"{a} {mv2} {mv2} {mv2}",
			vec!["mv2", "mv2", "mv2"],
			&nonempty_context,
		);
		test!(
			"{a} {b} {mv1} {mv2}",
			vec!["mv1", "mv2",],
			&nonempty_context,
		);
		test!(
			"{a} {mv1} {mv1} {mv2} {mv1} {mv2} {mv2} {b} ",
			vec!["mv1", "mv1", "mv2", "mv1", "mv2", "mv2"],
			&nonempty_context,
		);

		// Not actually missing any
		assert!(do_variable_substitution("{a} {b}", &nonempty_context).is_ok());
	}

	#[test]
	fn illegal_var_names() {
		macro_rules! test {
			($input:expr, $illegal_varnames:expr, $context:expr $(,)?) => {
				assert_eq!(
					do_variable_substitution($input, $context).err().unwrap(),
					VariableSubstitutionError::new_with_illegal_names(
						($illegal_varnames).iter().map(|&s| s.to_owned()).collect()
					)
				)
			};
		}

		let empty_context = DecodingContext::new_empty();

		test!("{}", vec![""], &empty_context);
		test!("{ }", vec![" "], &empty_context);
		test!("{\n}", vec!["\n"], &empty_context);
		test!("{ a }", vec![" a "], &empty_context);
		test!("{a.}", vec!["a."], &empty_context);
		test!("{ .}", vec![" ."], &empty_context);

		test!("{} {}", vec!["", ""], &empty_context);
		test!("{ } {}", vec![" ", ""], &empty_context);
		test!("{} { }", vec!["", " "], &empty_context);
		test!("{ } { }", vec![" ", " "], &empty_context);
		test!(
			"{} { } {  } { a } { a } { b } {}",
			vec!["", " ", "  ", " a ", " a ", " b ", ""],
			&empty_context,
		);
	}

	#[test]
	fn illegal_and_missing_var_names() {
		macro_rules! test {
			($input:expr, illegal: $illegal:expr, missing: $missing:expr, $context:expr $(,)?) => {
				assert_eq!(
					do_variable_substitution($input, $context).err().unwrap(),
					VariableSubstitutionError::VariableNameError {
						illegal_names: ($illegal as Vec<&str>)
							.iter()
							.map(|&s| s.to_owned())
							.collect(),
						missing_from_context: ($missing as Vec<&str>)
							.iter()
							.map(|&s| s.to_owned())
							.collect()
					}
				)
			};
		}

		let empty_context = DecodingContext::new_empty();

		test!(
			"{} {a}",
			illegal: vec![""],
			missing: vec!["a"],
			&empty_context,
		);

		test!(
			"{} {a} {} {a}",
			illegal: vec!["", ""],
			missing: vec!["a", "a"],
			&empty_context,
		);

		test!(
			"{} {a} { } {b}",
			illegal: vec!["", " "],
			missing: vec!["a", "b"],
			&empty_context,
		);

		test!(
			"{} { a } { } { b }",
			illegal: vec!["", " a ", " ", " b "],
			missing: vec![],
			&empty_context,
		);

		test!(
			"{a} {b} {c} {d}",
			illegal: vec![],
			missing: vec!["a", "b", "c", "d"],
			&empty_context,
		);

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &VV::Number(CN::UInt(2))),
			("c", &VV::Number(CN::Float(3.0))),
			("d", &xyz_string),
		]);

		test!(
			"{} {a} {} {a}",
			illegal: vec!["", ""],
			missing: vec![],
			&nonempty_context,
		);

		test!(
			"{} {a} { } {e}",
			illegal: vec!["", " "],
			missing: vec!["e"],
			&nonempty_context,
		);

		test!(
			"{} { a } { } { b }",
			illegal: vec!["", " a ", " ", " b "],
			missing: vec![],
			&nonempty_context,
		);

		test!(
			"{a} {b} { c } { d } {e}",
			illegal: vec![" c ", " d "],
			missing: vec!["e"],
			&nonempty_context,
		);

		assert!(do_variable_substitution("{a} {b} {c} {d}", &nonempty_context).is_ok());
	}
}
