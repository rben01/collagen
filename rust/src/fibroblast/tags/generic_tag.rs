use super::{
	any_child_tag::AnyChildTagDiscriminants, validation::Validatable, DeChildTags, DeXmlAttrs,
	DecodingContext, Extras, UnvalidatedDeChildTags,
};
use crate::{
	from_json::decoding_error::InvalidSchemaErrorList,
	to_svg::svg_writable::{write_tag, SvgWritable},
	ClgnDecodingResult,
};
use compact_str::CompactString;
use serde::{Deserialize, Serialize};

/// `GenericTag` is a generic tag that doesn't need to be handled specially, such as
/// `<rect>`, which needs no special. This is different from, say, `<image>`, which
/// needs some extra work and thus requires the specialized `Imagetag`.
///
/// `GenericTag`'s tag name — the thing between the angle brackets (`rect` in `<rect>`)
/// — is determined by the `tag_name` field.
///
/// # Properties
///
/// - `tag_name`
///   - Type: string
///   - Required: Yes.
///   - Description: The tag's name. For instance, to make a `<rect>` tag, use
///     `"tag_name": "rect"`.
#[derive(Debug, Clone, Serialize)]
pub struct GenericTag {
	#[serde(flatten)]
	inner: Inner,

	children: DeChildTags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	#[serde(rename = "tag")]
	tag_name: CompactString,

	attrs: DeXmlAttrs,
}

impl SvgWritable for GenericTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl std::io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		let Self {
			inner: Inner { tag_name, attrs },
			children,
		} = self;
		write_tag(writer, tag_name, attrs.as_ref(), |writer| {
			for child in children.as_ref() {
				child.to_svg(writer, context)?;
			}
			Ok(())
		})
	}
}

#[derive(Debug, Deserialize)]
pub(crate) struct UnvalidatedGenericTag {
	#[serde(flatten)]
	inner: Inner,

	children: UnvalidatedDeChildTags,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedGenericTag {
	type Validated = GenericTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner { tag_name, attrs },
			children,
			extras,
		} = self;

		if let Err(err) = extras.ensure_empty(AnyChildTagDiscriminants::Generic.name()) {
			errors.push(err);
		}

		Ok(GenericTag {
			inner: Inner { tag_name, attrs },
			children: children.into_validated(errors)?,
		})
	}
}
