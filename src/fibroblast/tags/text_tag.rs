use super::{element::HasOwnedVars, DeTagVariables, DecodingContext, TagVariables};
use crate::{impl_trivially_validatable, to_svg::svg_writable::SvgWritable, ClgnDecodingResult};
use compact_str::CompactString;
use quick_xml::events::BytesText;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextTag {
	text: CompactString,

	#[serde(default, skip_serializing_if = "Option::is_none")]
	is_preescaped: Option<bool>,

	#[serde(flatten)]
	vars: DeTagVariables,
}

impl HasOwnedVars for TextTag {
	fn vars_mut(&mut self) -> &mut Option<TagVariables> {
		self.vars.as_mut()
	}
}

impl<'a> SvgWritable<'a> for TextTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<()> {
		let is_preescaped = self.is_preescaped.unwrap_or(false);
		let text = context.eval_exprs_in_str(&self.text)?;

		let bt = if is_preescaped {
			BytesText::from_escaped(text)
		} else {
			BytesText::new(text.as_ref())
		};

		writer.write_event(crate::XmlEvent::Text(bt))?;

		Ok(())
	}
}

impl_trivially_validatable!(TextTag);
