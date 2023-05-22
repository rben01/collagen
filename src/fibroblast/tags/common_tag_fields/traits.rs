use crate::fibroblast::tags::{AnyChildTag, TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};

use super::CommonTagFields;

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
		self.children.as_deref().unwrap_or(&[])
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
		impl $crate::fibroblast::tags::common_tag_fields::traits::HasVars for $ty {
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
		impl<'a> $crate::fibroblast::tags::common_tag_fields::traits::HasCommonTagFields<'a>
			for $ty
		{
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
