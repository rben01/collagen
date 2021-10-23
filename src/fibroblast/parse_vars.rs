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
	IllegalVariableName(String),
	VariableNotFound(Vec<String>),
	UnterminatedVariableName(String),
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
			(false, InsideBracesValid, '}') => {
				did_make_subn = true;

				let var_name = &s[left..i];
				let var_value = context.get_var(var_name);
				match var_value {
					Some(var_value) => string_result.push_str(&var_value.to_string()),
					None => missing_var_names.push(var_name.to_owned()),
				}

				left = i + c.len_utf8();
				parse_state = Normal;
			}
			(false, InsideBracesValid, c) if !VAR_NAME_CHAR_RE.is_match(&c.to_string()) => {
				parse_state = InsideBracesInvalid;
			}
			(false, InsideBracesInvalid, '}') => {
				return Err(VariableSubstitutionError::IllegalVariableName(
					s[left..i].to_string(),
				));
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
			if !missing_var_names.is_empty() {
				Err(VariableSubstitutionError::VariableNotFound(
					missing_var_names,
				))
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
	fn empty_context() {
		let context = DecodingContext::new_empty();

		let s1 = "";
		assert_eq!(do_variable_substitution(s1, &context).unwrap(), s1);

		let s2 = "s2";
		assert_eq!(do_variable_substitution(s2, &context).unwrap(), s2);
	}

	#[test]
	fn missing_vars() {
		let empty_context = DecodingContext::new_empty();

		assert_eq!(
			do_variable_substitution("{missing_var}", &empty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["missing_var".to_string()])
		);

		assert_eq!(
			do_variable_substitution("{mv1} {mv2}", &empty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["mv1".to_owned(), "mv2".to_owned()])
		);

		assert_eq!(
			do_variable_substitution("a {mv1} b {mv2} c", &empty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["mv1".to_owned(), "mv2".to_owned()])
		);

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &xyz_string),
		]);

		assert_eq!(
			do_variable_substitution("{mv1} {mv2}", &nonempty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["mv1".to_owned(), "mv2".to_owned()])
		);

		assert_eq!(
			do_variable_substitution("{a} {mv2}", &nonempty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["a".to_owned()])
		);

		assert_eq!(
			do_variable_substitution("{a} {b} {mv1} {mv2}", &nonempty_context)
				.err()
				.unwrap(),
			VariableSubstitutionError::VariableNotFound(vec!["mv1".to_owned(), "mv2".to_owned()])
		);

		assert!(do_variable_substitution("{a} {b}", &nonempty_context).is_ok());
	}
}
