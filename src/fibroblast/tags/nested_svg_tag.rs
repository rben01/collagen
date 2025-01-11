use super::{any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeXmlAttrs, Extras};
use crate::{
	fibroblast::data_types::DecodingContext,
	from_json::decoding_error::InvalidSchemaErrorList,
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
pub struct NestedSvgTag {
	#[serde(flatten)]
	inner: Inner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
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
		let Self {
			inner: Inner { svg_path, attrs },
		} = self;

		write_tag(writer, "g", attrs.as_ref(), |writer| {
			let abs_svg_path = context.canonicalize(svg_path)?;

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
	#[serde(flatten)]
	inner: Inner,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedNestedSvgTag {
	type Validated = NestedSvgTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner { svg_path, attrs },
			extras,
		} = self;

		if let Err(e) = extras.ensure_empty(AnyChildTagDiscriminants::NestedSvg.name()) {
			errors.push(e);
		}

		if errors.is_empty() {
			Ok(NestedSvgTag {
				inner: Inner { svg_path, attrs },
			})
		} else {
			Err(())
		}
	}
}
