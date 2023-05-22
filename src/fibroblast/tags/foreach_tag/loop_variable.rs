use super::collection::{Collection, UnvalidatedCollection};
use crate::to_svg::svg_writable::ClgnDecodingError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub(super) struct UnvalidatedLoopVariable {
	#[serde(rename = "variable")]
	name: String,
	#[serde(rename = "in")]
	pub(super) collection: UnvalidatedCollection,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoopVariable {
	pub(super) name: String,
	pub(super) collection: Collection,
}

impl TryFrom<UnvalidatedLoopVariable> for LoopVariable {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedLoopVariable) -> Result<Self, Self::Error> {
		let UnvalidatedLoopVariable { name, collection } = value;
		let collection = collection.try_into()?;
		Ok(Self { name, collection })
	}
}
