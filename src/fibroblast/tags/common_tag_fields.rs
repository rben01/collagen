use super::{AnyChildTag, TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};
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
#[derive(Serialize, Deserialize, Debug, Default, Clone)]
#[serde(deny_unknown_fields)]
pub struct CommonTagFields<'a> {
	/// (Optional) A dictionary mapping variable names to their values. None is
	/// equivalent to no variables.
	#[serde(default)]
	vars: Option<TagVariables>,

	/// (Optional) A dictionary of name="value" XML attributes. None is equivalent to no
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

pub(crate) trait HasVars {
	fn base_vars(&self) -> &TagVariables;
	fn base_vars_mut(&mut self) -> &mut Option<TagVariables>;
}

// NOTE: Don't try to be clever here and introduce `fn common_tag_fields(&self) ->
// &CommonTagFields` so that you can use it to add default implementations of these
// methods. IT WON'T WORK. IT WILL NEVER WORK. YOU WILL SPEND HOURS MESSING AROUND WITH
// LIFETIMES AND IT WILL NEVER WORK. EVER. DON'T TRY. JUST DEAL WITH THE DUPLICATED CODE
// AND MOVE ON.
//
// For some reason, `self.field.by_ref_method()` acts differently with respect to
// lifetimes than `self.field_ref().by_ref_method()`, as `self.field_ref()` will require
// `self` to have a lifetime that `self.field` doesn't require.
//
// Ultimately I think the root case is that `CommonTagFields` has a recursive lifetime
// (since it includes `AnyChildTag<'a>` which includes `CommonTagFields<'a>` which
// includes...) and I think recursive lifetimes break the borrow checker, even if in
// theory they should work (or at least give a better error message.)
pub(crate) trait HasCommonTagFields<'a>: HasVars {
	fn base_attrs(&self) -> &XmlAttrs;
	fn base_children(&'a self) -> &'a [AnyChildTag<'a>];
	fn base_text(&self) -> &str;
	fn should_escape_text(&self) -> bool;
}

impl HasVars for CommonTagFields<'_> {
	fn base_vars(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&EMPTY_VARS)
	}

	fn base_vars_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

impl<'a> HasCommonTagFields<'a> for CommonTagFields<'a> {
	fn base_attrs(&self) -> &XmlAttrs {
		self.attrs.as_ref().unwrap_or(&EMPTY_ATTRS)
	}

	fn base_children(&'a self) -> &'a [AnyChildTag<'a>] {
		match &self.children {
			None => &[],
			Some(children) => children.as_ref(),
		}
	}

	fn base_text(&self) -> &str {
		self.text.as_deref().unwrap_or("")
	}

	fn should_escape_text(&self) -> bool {
		self.should_escape_text.unwrap_or(true)
	}
}

#[macro_export]
macro_rules! dispatch_to_common_tag_fields {
	(impl HasVars for $ty:ty) => {
		impl $crate::fibroblast::tags::common_tag_fields::HasVars for $ty {
			fn base_vars(&self) -> &$crate::fibroblast::data_types::TagVariables {
				self.common_tag_fields.base_vars()
			}
			fn base_vars_mut(
				&mut self,
			) -> &mut Option<$crate::fibroblast::data_types::TagVariables> {
				self.common_tag_fields.base_vars_mut()
			}
		}
	};
	(impl<'a> HasCommonTagFields<'a> for $ty:ty) => {
		impl<'a> HasCommonTagFields<'a> for $ty {
			fn base_attrs(&self) -> &$crate::fibroblast::data_types::XmlAttrs {
				self.common_tag_fields.base_attrs()
			}

			fn base_children(&'a self) -> &'a [$crate::fibroblast::tags::AnyChildTag<'a>] {
				self.common_tag_fields.base_children()
			}

			fn base_text(&self) -> &str {
				self.common_tag_fields.base_text()
			}

			fn should_escape_text(&self) -> bool {
				self.common_tag_fields.should_escape_text()
			}
		}
	};
}
