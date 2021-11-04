use super::{AnyChildTag, DecodingContext, TagVariables, XmlAttrs, EMPTY_ATTRS, EMPTY_VARS};
use crate::{
	fibroblast::data_types::{ConcreteNumber, Map},
	ClgnDecodingResult,
};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub(crate) enum FontAttr {
	String(String),
	Number(ConcreteNumber),
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct FontFace {
	name: String,
	path: String,

	#[serde(default)]
	attrs: Map<String, FontAttr>,
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct FontTag {
	fonts: Vec<FontFace>,

	#[serde(default)]
	vars: Option<TagVariables>,

	#[serde(default)]
	attrs: Option<XmlAttrs>,
}

impl FontTag {
	pub(super) fn tag_name(&self) -> &str {
		"defs"
	}

	pub(super) fn base_vars(&self) -> &TagVariables {
		match &self.vars {
			None => &EMPTY_VARS,
			Some(vars) => vars,
		}
	}

	pub(super) fn base_attrs(&self) -> &XmlAttrs {
		match &self.attrs {
			None => &EMPTY_ATTRS,
			Some(attrs) => attrs,
		}
	}

	pub(super) fn base_children<'a>(&self) -> &[AnyChildTag<'a>] {
		&[]
	}

	pub(super) fn get_font_path_attr_pair<S: AsRef<str>>(
		&self,
		path: S,
		context: &DecodingContext,
	) -> ClgnDecodingResult<(&str, String)> {
		let path = path.as_ref();
		let abs_font_path = context.get_root().join(path);
		let b64_string = base64::encode(std::fs::read(abs_font_path)?);
		let src_str = format!(
			"data:application/font-woff2;charset=utf-8;base64,{}",
			b64_string
		);

		Ok(("src", src_str))
	}

	pub(super) fn font_embed_text(&self, context: &DecodingContext) -> ClgnDecodingResult<String> {
		let mut text = String::from("<style>");
		for font in &self.fonts {
			let FontFace {
				name: font_family,
				path,
				attrs,
			} = font;

			let mut all_attrs = vec![(
				"font-family",
				Cow::Owned(FontAttr::String(font_family.to_owned())),
			)];

			let (src, b64_font) = self.get_font_path_attr_pair(path, context)?;
			all_attrs.push((src, Cow::Owned(FontAttr::String(b64_font))));

			all_attrs.extend(attrs.iter().map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))));

			text.push_str("@font-face{");

			for (k, v) in all_attrs {
				let wrapped_val = match &v {
					Cow::Owned(owned_val) => owned_val,
					Cow::Borrowed(borrowed_val) => *borrowed_val,
				};
				let new_val = match wrapped_val {
					FontAttr::String(text) => context.sub_vars_into_str(text.as_ref())?,
					FontAttr::Number(n) => Cow::Owned(n.to_string()),
				};
				text.push_str(k);
				text.push(':');
				text.push_str(&new_val);
				text.push(';');
			}

			text.push('}');
		}

		text.push_str("</style>");

		Ok(text)
	}

	pub(super) fn should_encode_text(&self) -> bool {
		false
	}
}
