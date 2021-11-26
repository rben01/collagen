use super::AnyChildTag;
use super::{TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};
use serde::{Deserialize, Serialize};

/// The properties common to most tags. Unless documented otherwise, all tag types are
/// expected to accept at least the following keys. Note that none of these properties
/// *need* to be specified; a missing value is treated as if it were explicitly
/// specified as empty.
///
/// # Properties
///
/// - `vars`
///   - Type: object, with values either number or string
///   - Required: No. Missing is roughly equivalent to `{}`, except that variable
///     substitution will not be attempted if `vars` is missing, i.e., `"{x}"` will be
///     left as-is if `vars` is missing, whereas it will raise an error during decoding
///     if `vars` is `{}` (due to variable `x` missing).
///   - Description: A dictionary mapping variable names to their values. Variables are
///     used for substitutions in other attributes. For instance, if `vars` is `{ "x":
///     10, "y": 20 }` and `text` is `"{x} {y}"`, then `text` will be converted to `10
///     20` before inclusion in XML. Also applies to the values in `attrs`.\
///     The syntax to specify that a variable should be substitued is simple: simply
///     surround the variable name in curly braces (this is reminiscent of [Format Args
///     Implicit
///     Identifiers](https://rust-lang.github.io/rfcs/2795-format-args-implicit-identifiers.html),
///     which enables `"{variable}"` in most macros).
/// - `attrs`
///   - Type: object, with values either number or string
///   - Required: No. Missing is equivalent to `{}`.
///   - Description: A dictionary whose keys and values will be used to construct the
///     list of `name="value"` XML attributes. For instance, `{ "tag": "circle",
///     "attrs": { "cx": 10, "cy": 20, "r": 5 } }` will be turned into `<circle cx=10
///     cy=20 r=5></circle>`. Variable substitution is performed on the values in
///     `attrs` using `vars`.
/// - `children`
///   - Type: list of the child tags of this tag, which are objects interpretable as
///     `AnyChildTag`
///   - Required: No. Missing is equivalent to `[]`.
///   - Description: A list of children of this tag. Each child in the list is an object
///     interpretable as `AnyChildTag`. For example, `{ "tag": "g", "children": [{
///     "tag": "rect", "attrs": ... }, { "image_path": ... }] }`
/// - `text`
///   - Type: string
///   - Required: No. Missing is equivalent to `""`.
///   - Description The text contained inside this tag. For example, `{ "tag": "text",
///     "text": "hello" }` becomes `<text>hello</text>`. Variable substitution is
///     performed on `text`.
/// - `should_encode_text`
///   - Type: bool
///   - Required: No. Missing is equivalent to `true`.
///   - Whether `text` needs to be escaped before inclusion in XML. "Escaping" means
///     encoding characters that are have special meaning in XML, such as `<` and `>`,
///     in a safe representation, such as `&lt;` and `&gt;`, respectively. Text should
///     go through exactly one round of XML-encoding before inclusion in XML.
#[derive(Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct CommonTagFields<'a> {
	/// (Optional) A dictionary mapping variable names to their values. None is
	/// equivalent to no variables.
	#[serde(default)]
	vars: Option<TagVariables>,

	/// (Optional) A dictionary of name="value" XML attributes. NuNonell is equivalent to no
	/// attributes.
	#[serde(default)]
	attrs: Option<XmlAttrs>,

	/// (Optional) A list of children of this tag. None is equivalent to the empty list.
	#[serde(default)]
	children: Option<Vec<AnyChildTag<'a>>>,

	/// (Optional) The text contained inside this tag, i.e., the "some text" in
	/// `<tag>some text</tag>`. None is equivalent to the empty string.
	#[serde(default)]
	text: Option<String>,

	/// (Optional) Whether `text` needs to be escaped before inclusion in XML. "Escaping"
	/// means converting illegal characters, such as `<`, to a safe representation, such
	/// as `&lt;`. Text should go through exactly one round of escaping before inclusion
	/// in XML. None is equivalent to `true`.
	#[serde(default)]
	should_escape_text: Option<bool>,
}

impl<'a> CommonTagFields<'a> {
	pub(crate) fn base_vars(&self) -> &TagVariables {
		match &self.vars {
			None => &EMPTY_VARS,
			Some(vars) => vars,
		}
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		}
	}

	pub(crate) fn base_children(&self) -> &[AnyChildTag<'a>] {
		match &self.children {
			None => &[],
			Some(children) => children,
		}
	}

	pub(crate) fn base_text(&self) -> &str {
		match &self.text {
			None => "",
			Some(t) => t.as_ref(),
		}
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		self.should_escape_text.unwrap_or(true)
	}
}
