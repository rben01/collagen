use crate::ClgnDecodingResult;

pub(crate) trait Validatable: Sized {
	type Validated;

	fn validated(self) -> ClgnDecodingResult<Self::Validated>;
}

// pub(crate) trait RequiresCheckingForExtraKeys: Validatable {
// 	fn destructure(self) -> (Self::Validated, Extras);

// 	fn check_for_extra_keys(self) -> ClgnDecodingResult<Self::Validated>
// 	where
// 		Self: Sized,
// 	{
// 		let (tag, extras) = self.destructure();

// 		if !extras.is_empty() {
// 			return Err(InvalidSchemaError::unexpected_keys(
// 				AnyChildTagDiscriminants::Image.primary_key(),
// 				extras.keys().cloned().collect(),
// 			)
// 			.into());
// 		}

// 		Ok(tag)
// 	}
// }

// pub(crate) trait RequiresCheckingChildren: Validatable {
// 	fn children(self) -> DeChildTags;

// 	fn validated_children(self) -> ClgnDecodingResult<DeChildTags>
// 	where
// 		Self: Sized,
// 	{
// 		Ok(DeChildTags {
// 			children: self
// 				.children()
// 				.children
// 				.map(|c| {
// 					c.into_iter()
// 						.map(|child| child.validate())
// 						.collect::<ClgnDecodingResult<Vec<_>>>()
// 				}) // Option<Result<Vec<T>, E>>
// 				.transpose()?,
// 		})
// 	}
// }
