use crate::ClgnDecodingResult;

pub(crate) trait Validatable: Sized {
	type Validated;

	fn validated(self) -> ClgnDecodingResult<Self::Validated>;
}
