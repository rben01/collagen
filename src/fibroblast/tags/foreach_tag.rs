mod collection;
mod iterable;

use super::{
	error_tag::Validatable, traits::HasVars, AnyChildTag, DecodingContext, TagVariables, XmlAttrs,
	EMPTY_ATTRS, EMPTY_VARS,
};
use crate::{
	fibroblast::data_types::insert_var, to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult,
};
use iterable::{Loop, LoopVariable};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ForeachTag<'a> {
	#[serde(rename = "for_each")]
	pub(super) loops: Loop,
	#[serde(rename = "do")]
	pub(super) template: Box<AnyChildTag<'a>>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	vars: Option<TagVariables>,
	#[serde(skip)]
	pub(super) children: OnceCell<Vec<AnyChildTag<'a>>>,
}

impl Validatable for ForeachTag<'_> {
	fn validate(mut self) -> ClgnDecodingResult<Self>
	where
		Self: Sized,
	{
		self.template = Box::new(self.template.validate()?);
		Ok(self)
	}
}

impl HasVars for ForeachTag<'_> {
	fn base_vars(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&*EMPTY_VARS)
	}

	fn base_vars_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

impl<'a> ForeachTag<'a> {
	pub(crate) fn tag_name(&self) -> Option<&'static str> {
		None
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		&*EMPTY_ATTRS
	}

	pub(crate) fn base_text(&self) -> &str {
		Default::default()
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		Default::default()
	}

	pub(crate) fn children(
		&'a self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
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
							AnyChildTag::Error(_) => unreachable!(),
						};
					}

					children.push(tag);
				}

				Ok(children)
			})
			.map(|v| v.as_slice())
	}
}
