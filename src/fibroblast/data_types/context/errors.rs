use super::functions::{ArityError, FunctionCallError};

pub type VariableSubstitutionResult<T> = Result<T, VariableSubstitutionError>;

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug)]
pub enum VariableSubstitutionError {
	Parsing(nom::Err<String>),
	FunctionCall(ArityError),
	InvalidVariableName(String),
	UnknownVariableName(String),
	ExpectedNumGotStringForVariable { name: String, value: String },
	RecursiveSubstitutionError { names: Vec<String> },
	UnrecognizedFunctionName(String),
}

impl From<FunctionCallError<VariableSubstitutionError>> for VariableSubstitutionError {
	fn from(value: FunctionCallError<VariableSubstitutionError>) -> Self {
		match value {
			FunctionCallError::Arity(e) => Self::FunctionCall(e),
			FunctionCallError::Other(e) => e,
		}
	}
}
