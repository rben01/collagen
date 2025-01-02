use super::{any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeXmlAttrs, Extras};
use crate::{
	fibroblast::data_types::DecodingContext,
	to_svg::svg_writable::{write_tag, ClgnDecodingError, ClgnDecodingResult, SvgWritable},
};
use compact_str::CompactString;
use quick_xml::events::BytesText;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

static XML_HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
	RegexBuilder::new(r"^\s*<\?xml.*?\?>")
		.case_insensitive(true)
		.dot_matches_new_line(true)
		.build()
		.unwrap()
});

#[derive(Debug, Clone, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NestedSvgTag {
	/// The path to the SVG relative to the folder root
	svg_path: CompactString,

	#[serde(flatten)]
	attrs: DeXmlAttrs,
}

impl SvgWritable for NestedSvgTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		write_tag(writer, "g", self.attrs.as_ref(), |writer| {
			let abs_svg_path = context.canonicalize(&self.svg_path)?;

			let text = std::fs::read_to_string(&abs_svg_path).map_err(|source| {
				ClgnDecodingError::IoRead {
					source,
					path: abs_svg_path,
				}
			})?;
			let text = XML_HEADER_RE.replace(&text, "").trim().to_owned();

			let bt = BytesText::from_escaped(text);
			writer.write_event(crate::XmlEvent::Text(bt))?;

			Ok(())
		})
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UnvalidatedNestedSvgTag {
	svg_path: CompactString,

	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten, default)]
	extras: Extras,
}

impl Validatable for UnvalidatedNestedSvgTag {
	type Validated = NestedSvgTag;

	fn validated(self) -> ClgnDecodingResult<Self::Validated> {
		let Self {
			svg_path,
			attrs,
			extras,
		} = self;

		extras.ensure_empty(AnyChildTagDiscriminants::NestedSvg.name())?;

		Ok(NestedSvgTag { svg_path, attrs })
	}
}
