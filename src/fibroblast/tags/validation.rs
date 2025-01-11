use crate::from_json::decoding_error::InvalidSchemaErrorList;

pub(crate) trait Validatable: Sized {
	type Validated;

	/// Produce a validated version of self
	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()>;
}
