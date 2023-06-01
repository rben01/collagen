use std::slice;

use super::{
	error_tag::Validatable, traits::HasVars, AnyChildTag, DecodingContext, TagVariables, XmlAttrs,
	EMPTY_ATTRS, EMPTY_VARS,
};
use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IfTag<'a> {
	#[serde(rename = "if")]
	pub(super) predicate: String,
	#[serde(rename = "then")]
	pub(super) true_template: Box<AnyChildTag<'a>>,
	#[serde(rename = "else")]
	pub(super) false_template: Option<Box<AnyChildTag<'a>>>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	vars: Option<TagVariables>,
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

impl HasVars for IfTag<'_> {
	fn base_vars(&self) -> &TagVariables {
		self.vars.as_ref().unwrap_or(&*EMPTY_VARS)
	}

	fn base_vars_mut(&mut self) -> &mut Option<TagVariables> {
		&mut self.vars
	}
}

impl<'a> IfTag<'a> {
	pub(crate) fn tag_name(&self) -> Option<&'static str> {
		None
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		&*EMPTY_ATTRS
	}

	pub(crate) fn base_text(&self) -> &str {
		""
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		Default::default()
	}

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

	pub(crate) fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
		Ok(match self.child(context)? {
			Some(child) => slice::from_ref(child),
			None => &[],
		})
	}
}
