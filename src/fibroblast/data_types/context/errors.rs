use super::functions::{ArityError, FunctionCallError};

pub type VariableSubstitutionResult<T> = Result<T, Vec<VariableSubstitutionError>>;

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug)]
pub enum VariableSubstitutionError {
	Parsing(String),
	FunctionCall(ArityError),
	InvalidVariableName(String),
	MissingVariable(String),
	ExpectedNumGotString { variable: String, value: String },
	RecursiveSubstitutionError { variable: String },
	UnrecognizedFunctionName(String),
}

impl From<FunctionCallError<Vec<VariableSubstitutionError>>> for Vec<VariableSubstitutionError> {
	fn from(err: FunctionCallError<Vec<VariableSubstitutionError>>) -> Self {
		match err {
			FunctionCallError::Arity(e) => vec![VariableSubstitutionError::FunctionCall(e)],
			FunctionCallError::Other(e) => e,
		}
	}
}
