use super::DeXmlAttrs;
use crate::{
	fibroblast::data_types::DecodingContext,
	impl_trivially_validatable,
	to_svg::svg_writable::{write_tag, ClgnDecodingError, ClgnDecodingResult, SvgWritable},
};
use compact_str::CompactString;
use quick_xml::events::BytesText;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::sync::LazyLock;

static XML_HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
	RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NestedSvgTag {
	/// The path to the SVG relative to the folder root
	svg_path: CompactString,

	#[serde(flatten)]
	attrs: DeXmlAttrs,
}

impl NestedSvgTag {
	fn svg_path<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'b, str>> {
		Ok(context.eval_exprs_in_str(&self.svg_path)?)
	}
}

impl<'a> SvgWritable<'a> for NestedSvgTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<()> {
		write_tag(
			writer,
			"g",
			|elem| {
				context.write_attrs_into(self.attrs.as_ref().iter(), elem)?;
				Ok(())
			},
			|writer| {
				let abs_svg_path = crate::utils::paths::pathsep_aware_join(
					&*context.get_root(),
					self.svg_path(context)?,
				)?;

				let text = std::fs::read_to_string(&abs_svg_path)
					.map_err(|err| ClgnDecodingError::Io(err, abs_svg_path))?;
				let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();

				let bt = BytesText::from_escaped(text);
				writer.write_event(crate::XmlEvent::Text(bt))?;

				Ok(())
			},
		)?;

		Ok(())
	}
}

impl_trivially_validatable!(NestedSvgTag);
