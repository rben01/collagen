mod collection;
mod iterable;

use super::{
	traits::{HasCommonTagFields, HasVars},
	AnyChildTag, CommonTagFields, DecodingContext, XmlAttrs,
};
use crate::{
	dispatch_to_common_tag_fields, fibroblast::data_types::insert_var,
	to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult,
};
use iterable::{Loop, LoopVariable};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeachTag<'a> {
	#[serde(rename = "for_each")]
	pub(super) loops: Loop,
	#[serde(rename = "do")]
	pub(super) template: Box<AnyChildTag<'a>>,
	#[serde(flatten)]
	// the absence of children makes 'static appropriate here
	pub(super) common_tag_fields: CommonTagFields<'static>,
	#[serde(skip)]
	pub(super) children: OnceCell<Vec<AnyChildTag<'a>>>,
}

dispatch_to_common_tag_fields!(impl HasVars for ForeachTag<'_>);

impl<'a> ForeachTag<'a> {
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

	pub(crate) fn children(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
		let n_children = self
			.common_tag_fields
			.children
			.as_ref()
			.map(|v| v.len())
			.unwrap_or(0);
		if n_children > 0 {
			return Err(ClgnDecodingError::Foreach {
				msg: "for_each must not have any children; use the `template` field instead".into(),
			});
		}

		let (loops, loop_len) = {
			let mut loops = Vec::new();

			let mut loops_iter = (&self.loops).into_iter();
			let Some(LoopVariable { name, loop_collection: first_collection }) = loops_iter.next() else {
				return Err(ClgnDecodingError::Foreach {
					msg: "the list of variables to loop over in a `for_each` must be nonempty"
						.into(),
				});
			};

			let first_reified = first_collection.reified(context)?;
			let iterable_len = first_reified.len();
			loops.push((name, first_reified));

			for LoopVariable {
				name,
				loop_collection: collection,
			} in loops_iter
			{
				let reified = collection.reified(context)?;
				if reified.len() != iterable_len {
					return Err(ClgnDecodingError::Foreach {
						msg: format!(
							"when specifying multiple collections in a `for_each`, \
					 		 they must all have the same length; but got {} \
							 with length {}, and {} with length {}",
							serde_json::to_string(first_collection)
								.map_err(|e| ClgnDecodingError::JsonEncode(e, None))?,
							iterable_len,
							serde_json::to_string(collection)
								.map_err(|e| ClgnDecodingError::JsonEncode(e, None))?,
							reified.len()
						),
					});
				}
				loops.push((name, reified));
			}

			(loops, iterable_len)
		};

		self.children
			.get_or_try_init(|| {
				let mut children = Vec::new();

				for i in 0..loop_len {
					let mut tag = *self.template.clone();

					for (name, reified) in &loops {
						let name = (*name).clone();
						let elem = reified.get(i).unwrap().into_owned();

						match &mut tag {
							AnyChildTag::Image(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
							AnyChildTag::Container(_) => {}
							AnyChildTag::NestedSvg(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
							AnyChildTag::Font(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
							AnyChildTag::Other(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
							AnyChildTag::Foreach(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
							AnyChildTag::If(t) => {
								insert_var(t.base_vars_mut(), name, elem);
							}
						};
					}

					children.push(tag);
				}

				Ok(children)
			})
			.map(|v| v.as_slice())
	}
}
