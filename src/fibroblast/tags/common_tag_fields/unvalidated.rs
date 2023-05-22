use super::{TagVariables, XmlAttrs};
use crate::fibroblast::tags::any_child_tag::unvalidated::UnvalidatedAnyChildTag;
use serde::Deserialize;

#[derive(Deserialize, Debug, Default, Clone)]
#[serde(deny_unknown_fields)]
pub(crate) struct UnvalidatedCommonTagFields {
	/// (Optional) A dictionary mapping variable names to their values. None is
	/// equivalent to no variables.
	#[serde(default)]
	pub(super) vars: Option<TagVariables>,

	/// (Optional) A dictionary of name="value" XML attributes. None is equivalent to no
	/// attributes.
	#[serde(default)]
	pub(super) attrs: Option<XmlAttrs>,

	/// (Optional) A list of children of this tag. None is equivalent to the empty list.
	#[serde(default)]
	pub(super) children: Option<Vec<UnvalidatedAnyChildTag>>,

	/// (Optional) The text contained inside this tag, i.e., the "some text" in
	/// `<tag>some text</tag>`. None is equivalent to the empty string.
	#[serde(default)]
	pub(super) text: Option<String>,

	/// (Optional) Whether `text` needs to be escaped before inclusion in XML. "Escaping"
	/// means converting illegal characters, such as `<`, to a safe representation, such
	/// as `&lt;`. Text should go through exactly one round of escaping before inclusion
	/// in XML. None is equivalent to `true`.
	#[serde(default)]
	pub(super) should_escape_text: Option<bool>,
}
