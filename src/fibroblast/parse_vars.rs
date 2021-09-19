use super::DecodingContext;
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
	static ref VAR_NAME_CHAR_RE: Regex = Regex::new(r"\w").unwrap();
}

#[derive(Debug)]
pub(crate) enum VariableSubstitutionError {
	IllegalVariableName(String),
	VariableNotFound(String),
	UnterminatedVariableName(String),
}

pub(super) fn do_variable_substitution(
	s: &str,
	context: &DecodingContext,
) -> Result<Option<String>, VariableSubstitutionError> {
	if context.vars_map().len() == 0 {
		return Ok(None);
	}

	enum ParseState {
		Normal,
		InsideBracesValid,
		InsideBracesInvalid,
	}
	use ParseState::*;

	let mut string_result = String::new();

	let mut parse_state = ParseState::Normal;
	let mut prev_was_backslash = false;
	let mut left = 0;

	// let mut push_part_til_here = |i: usize, c: char| {
	// 	string_result.push_str(&s[left..i]);
	// 	left = i + c.len_utf8();
	// };

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
				let var_name = &s[left..i];
				let var_value = context.get_var(var_name);
				match var_value {
					Some(var_value) => {
						string_result.push_str(&var_value.to_string());
					}
					None => {
						return Err(VariableSubstitutionError::VariableNotFound(
							var_name.to_string(),
						));
					}
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
			string_result.push_str(&s[left..]);
			Ok(Some(string_result))
		}
		InsideBracesValid | InsideBracesInvalid => Err(
			VariableSubstitutionError::UnterminatedVariableName(s[left..].to_string()),
		),
	}
}
