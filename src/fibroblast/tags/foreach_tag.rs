mod collection;
mod iterable;

use super::{
	element::{insert_var, HasOwnedVars},
	error_tag::Validatable,
	AnyChildTag, DeTagVariables, DecodingContext, TagVariables,
};
use crate::{
	to_svg::svg_writable::{ClgnDecodingError, SvgWritable},
	ClgnDecodingResult,
};
use iterable::{Loop, LoopVariable};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ForeachTag<'a> {
	#[serde(rename = "for_each")]
	pub(super) loops: Loop,

	#[serde(rename = "do")]
	pub(super) template: Box<AnyChildTag<'a>>,

	#[serde(flatten)]
	vars: DeTagVariables,
}

impl HasOwnedVars for ForeachTag<'_> {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> SvgWritable<'a> for ForeachTag<'a> {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<()> {
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

		for i in 0..loop_len {
			let mut tag = *self.template.clone();

			for (name, reified) in &loops {
				let name = (*name).clone();
				let elem = reified.get(i).unwrap().into_owned();

				let vars = match &mut tag {
					AnyChildTag::Generic(t) => t.vars_mut(),
					AnyChildTag::Image(t) => t.vars_mut(),
					AnyChildTag::Foreach(t) => t.vars_mut(),
					AnyChildTag::If(t) => t.vars_mut(),
					AnyChildTag::Font(t) => t.vars_mut(),
					AnyChildTag::Text(t) => t.vars_mut(),
					AnyChildTag::Container(_) | AnyChildTag::NestedSvg(_) => continue,
					AnyChildTag::Error(_) => unreachable!(),
				};

				insert_var(vars, name, elem);
			}

			tag.to_svg(writer, context)?;
		}
		Ok(())
	}
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
