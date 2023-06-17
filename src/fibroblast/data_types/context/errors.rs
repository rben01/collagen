use super::functions::{FunctionCallError, FunctionCallSiteError};

pub type VariableSubstitutionResult<T> = Result<T, Vec<VariableSubstitutionError>>;

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum VariableSubstitutionError {
	Parsing(String),
	FunctionCall(FunctionCallSiteError),
	InvalidVariableNameOrExpression(String),
	MissingVariable(String),
	ExpectedNumGotString { variable: String, value: String },
	RecursiveSubstitutionError { variable: String },
	UnrecognizedFunctionName(String),
	InvalidEscapedChar(char),
	TrailingBackslash,
	UnmatchedRightBrace,
	UnmatchedLeftBrace,
}

impl From<FunctionCallError<Vec<VariableSubstitutionError>>> for Vec<VariableSubstitutionError> {
	fn from(err: FunctionCallError<Vec<VariableSubstitutionError>>) -> Self {
		match err {
			FunctionCallError::CallSite(e) => {
				vec![VariableSubstitutionError::FunctionCall(e)]
			}
			FunctionCallError::Upstream(e) => e,
		}
	}
}
