use super::{
	element::HasOwnedVars, error_tag::Validatable, AnyChildTag, DeTagVariables, DecodingContext,
	TagVariables,
};
use crate::{
	to_svg::svg_writable::{ClgnDecodingError, SvgWritable},
	ClgnDecodingResult,
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
	vars: DeTagVariables,
}

impl HasOwnedVars for IfTag<'_> {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
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
		Ok(if self.should_be_emitted(context)? {
			Some(self.true_template.as_ref())
		} else {
			self.false_template.as_deref()
		})
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

impl<'a> SvgWritable<'a> for IfTag<'a> {
	fn to_svg(
		&self,
		context: &DecodingContext<'a>,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		if let Some(child) = self.child(context)? {
			child.to_svg(context, writer)?;
		}
		Ok(())
	}
}
