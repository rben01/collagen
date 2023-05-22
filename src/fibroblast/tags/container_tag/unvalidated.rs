use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct UnvalidatedContainerTag {
	pub(super) clgn_path: String,
}
