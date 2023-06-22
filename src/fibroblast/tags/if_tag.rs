use super::{
	element::{AsNodeGenerator, HasOwnedVars, HasVars},
	error_tag::Validatable,
	AnyChildTag, DeTagVariables, DecodingContext, TagVariables,
};
use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult};
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, slice};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IfTag<'a> {
	#[serde(rename = "if")]
	pub(super) predicate: String,

	#[serde(rename = "then")]
	pub(super) true_template: Box<AnyChildTag<'a>>,

	#[serde(rename = "else")]
	pub(super) false_template: Option<Box<AnyChildTag<'a>>>,

	#[serde(flatten)]
	vars: DeTagVariables,
}

impl HasVars for IfTag<'_> {
	fn vars(&self) -> &TagVariables {
		self.vars.as_ref()
	}
}

impl HasOwnedVars for IfTag<'_> {
	fn vars_mut(&self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> AsNodeGenerator<'a> for IfTag<'a> {
	fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, [AnyChildTag<'a>]>> {
		Ok(Cow::Borrowed(match self.child(context)? {
			Some(child) => slice::from_ref(child),
			None => &[],
		}))
	}
}

impl<'a> IfTag<'a> {
	pub(crate) fn should_be_emitted(&self, context: &DecodingContext) -> ClgnDecodingResult<bool> {
		let val = context.eval_exprs_in_str(&self.predicate)?;
		let res = val.parse::<f64>().map_err(|_| ClgnDecodingError::If {
			msg: format!(
				"`if` tag's predicate, {:?}, did not evaluate to a float",
				self.predicate
			),
		})?;
		Ok(res != 0.0)
	}

	pub(crate) fn child(
		&self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<Option<&AnyChildTag<'a>>> {
		Ok(self
			.should_be_emitted(context)?
			.then(|| self.true_template.as_ref())
			.or_else(|| self.false_template.as_deref()))
	}
}

impl Validatable for IfTag<'_> {
	fn validate(mut self) -> ClgnDecodingResult<Self>
	where
		Self: Sized,
	{
		self.true_template = Box::new(self.true_template.validate()?);
		self.false_template = self
			.false_template
			.map(|ft| ft.validate().map(Box::new))
			.transpose()?;

		Ok(self)
	}
}
