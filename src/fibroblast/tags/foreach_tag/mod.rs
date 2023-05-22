mod collection;
mod iterable;
mod loop_variable;
mod unvalidated;

use super::{
	traits::{HasCommonTagFields, HasVars},
	AnyChildTag, CommonTagFields, XmlAttrs,
};
use crate::{
	dispatch_to_common_tag_fields, fibroblast::data_types::insert_var,
	to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult,
};
use iterable::Iterable;
use lazycell::LazyCell;
use loop_variable::LoopVariable;
use serde::Serialize;
pub(in crate::fibroblast::tags) use unvalidated::UnvalidatedForeachTag;

#[derive(Debug, Clone, Serialize)]
pub struct ForeachTag<'a> {
	pub(super) iterable: Iterable<LoopVariable>,
	pub(super) template: Box<AnyChildTag<'a>>,
	// the absence of children makes 'static appropriate here
	pub(super) common_tag_fields: CommonTagFields<'static>,
	#[serde(skip)]
	pub(super) children: LazyCell<Vec<AnyChildTag<'a>>>,
}

impl<'a> TryFrom<UnvalidatedForeachTag> for ForeachTag<'a> {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedForeachTag) -> Result<Self, Self::Error> {
		let UnvalidatedForeachTag {
			iterable,
			template,
			common_tag_fields,
		} = value;

		let iterable: Iterable<LoopVariable> = iterable.try_into()?;
		{
			let mut iter = (&iterable).into_iter();
			let len = iter.next().unwrap().collection.len();

			for LoopVariable { collection, .. } in iter {
				if collection.len() != len {
					return Err(ClgnDecodingError::Foreach {
						msg: "when specifying multiple collections in a `for_each`, \
					 		   they must all have the same length"
							.into(),
					});
				}
			}
		}

		let template = Box::new((*template).try_into()?);

		let common_tag_fields: CommonTagFields = common_tag_fields.try_into()?;
		if !common_tag_fields
			.children
			.as_ref()
			.map(|v| v.is_empty())
			.unwrap_or(false)
		{
			return Err(ClgnDecodingError::Foreach {
				msg: "for_each must not have any children".into(),
			});
		}

		let children = LazyCell::new();

		Ok(Self {
			iterable,
			template,
			common_tag_fields,
			children,
		})
	}
}

dispatch_to_common_tag_fields!(impl HasVars for ForeachTag<'_>);

impl<'a> ForeachTag<'a> {
	fn loop_len(&self) -> usize {
		self.iterable.into_iter().next().unwrap().collection.len()
	}

	pub(crate) fn tag_name(&self) -> &'static str {
		"g"
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(crate) fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		self.common_tag_fields.should_escape_text()
	}

	pub(crate) fn children(&'a self) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
		if let Some(children) = self.children.borrow() {
			return Ok(children.as_ref());
		}

		let mut children = Vec::new();
		for i in 0..self.loop_len() {
			let mut tag = *self.template.clone();

			for LoopVariable { name, collection } in &self.iterable {
				let elem = collection.get(i).unwrap();

				match &mut tag {
					AnyChildTag::Image(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Container(_) => {}
					AnyChildTag::NestedSvg(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Font(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Other(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Foreach(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
				};
			}

			children.push(tag);
		}

		self.children.fill(children).unwrap();
		Ok(self.children.borrow().unwrap().as_ref())
	}
}
