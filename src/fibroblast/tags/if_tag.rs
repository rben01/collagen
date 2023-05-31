use std::slice;

use super::{
	error_tag::Validatable, traits::HasCommonTagFields, AnyChildTag, CommonTagFields,
	DecodingContext, XmlAttrs,
};
use crate::{
	dispatch_to_common_tag_fields, to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult,
};
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
	#[serde(flatten)]
	// the absence of children makes 'static appropriate here
	pub(super) common_tag_fields: CommonTagFields<'static>,
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

dispatch_to_common_tag_fields!(impl HasVars for IfTag<'_>);

impl<'a> IfTag<'a> {
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
		let n_children = self
			.common_tag_fields
			.children
			.as_ref()
			.map(|v| v.len())
			.unwrap_or(0);
		if n_children > 0 {
			return Err(ClgnDecodingError::If {
				msg: "`if` must not have any children; use the `then` \
					    and (optional) `else` fields instead"
					.into(),
			});
		}

		Ok(match self.child(context)? {
			Some(child) => slice::from_ref(child),
			None => &[],
		})
	}
}
