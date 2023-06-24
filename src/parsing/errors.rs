use super::functions::{FunctionCallError, FunctionCallSiteError};

pub type VariableSubstitutionResult<T> = Result<T, Vec<VariableEvaluationError>>;

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum VariableEvaluationError {
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

impl From<FunctionCallError<Vec<VariableEvaluationError>>> for Vec<VariableEvaluationError> {
	fn from(err: FunctionCallError<Vec<VariableEvaluationError>>) -> Self {
		match err {
			FunctionCallError::CallSite(e) => {
				vec![VariableEvaluationError::FunctionCall(e)]
			}
			FunctionCallError::Upstream(e) => e,
		}
	}
}
