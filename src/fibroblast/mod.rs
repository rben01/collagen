mod data_types;

use data_types::SimpleValue;

use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Writer,
};

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::BTreeMap; // https://users.rust-lang.org/t/hashmap-vs-btreemap/13804/3
use std::io::Cursor;
use std::path::{Path, PathBuf};

use crate::decode::decoding_error::{ClgnDecodingError, ClgnDecodingResult};

pub(crate) type XmlAttrs = BTreeMap<String, SimpleValue>;
type AttrKVIteratorResult<'a> =
	ClgnDecodingResult<Box<dyn Iterator<Item = (&'a str, Cow<'a, SimpleValue>)> + 'a>>;

fn attrs_to_iterable_pairs(attrs: &XmlAttrs) -> AttrKVIteratorResult {
	Ok(Box::from(
		attrs.iter().map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
	))
}

pub(crate) trait TagLike {
	fn tag_name(&self) -> &str;
	fn text(&self) -> &str;
	fn children(&self) -> &[ChildTag];
	fn attrs_as_values(&self, root_dir: &Path) -> AttrKVIteratorResult;

	fn attrs_as_strings<'a>(
		&'a self,
		root_dir: &Path,
	) -> ClgnDecodingResult<Box<dyn Iterator<Item = (&'a str, String)> + 'a>> {
		use SimpleValue::*;

		let attrs_raw = self.attrs_as_values(root_dir)?;
		Ok(Box::from(attrs_raw.into_iter().filter_map(|(k, v)| {
			let v_maybe_string = match &*v {
				Number(x) => Some(x.to_string()),
				Text(s) => Some((*s).to_string()),
				Present => Some("".to_owned()),
				Absent => None,
			};

			v_maybe_string.map(|v_string| (k, v_string))
		})))
	}

	fn to_svg_through_writer(
		&self,
		root_dir: &Path,
		writer: &mut Writer<Cursor<Vec<u8>>>,
	) -> ClgnDecodingResult<()> {
		let tag_name = self.tag_name();
		let tag_name_bytes = tag_name.as_bytes();
		let mut curr_elem = BytesStart::borrowed_name(tag_name_bytes);

		let attributes = self.attrs_as_strings(root_dir)?.collect::<Vec<_>>();
		curr_elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_ref())));
		writer.write_event(XmlEvent::Start(curr_elem))?;

		for child in self.children() {
			child.to_svg_through_writer(root_dir, writer)?;
		}

		writer.write_event(XmlEvent::Text(BytesText::from_plain_str(self.text())))?;
		writer.write_event(XmlEvent::End(BytesEnd::borrowed(tag_name_bytes)))?;

		Ok(())
	}

	fn to_svg(&self, root_dir: &Path) -> ClgnDecodingResult<String> {
		let mut writer = Writer::new(Cursor::new(Vec::new()));
		self.to_svg_through_writer(root_dir, &mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ImageTag {
	image_path: String,

	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	kind: Option<String>,
}

impl ImageTag {
	fn kind(&self) -> Option<Cow<'_, str>> {
		match &self.kind {
			Some(kind) => Some(Cow::Borrowed(kind)),
			None => {
				let path = PathBuf::from(&self.image_path);
				let extn = path.extension()?;
				let extn = extn.to_str()?.to_ascii_lowercase();
				Some(Cow::Owned(extn))
			} // extension(&self.image_path).map(|extn| Cow::Owned(extn.to_ascii_lowercase())),
		}
	}
}

impl TagLike for ImageTag {
	fn tag_name(&self) -> &str {
		"image"
	}

	fn text(&self) -> &str {
		""
	}

	fn children(&self) -> &[ChildTag] {
		&[]
	}

	fn attrs_as_values(&self, root_dir: &Path) -> AttrKVIteratorResult {
		let kind = self.kind();
		let kind = match kind {
			Some(extn) => extn,
			None => {
				return Err(ClgnDecodingError::Image(format!(
					r#"Could not deduce the extension from {:?}, and no "kind" was given""#,
					self.image_path
				)));
			}
		};

		let abs_image_path = root_dir.join(&self.image_path);

		// Can this be streamed so that we don't need an intermediate buffer? Would it
		// be worth it?
		let image_bytes = std::fs::read(abs_image_path)?;
		let b64contents = base64::encode(image_bytes);

		let src_str = format!("data:image/{};base64,{}", kind, b64contents);

		let attrs = self
			.attrs
			.iter()
			.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
			.chain(Some(("xlink:href", Cow::Owned(SimpleValue::Text(src_str)))))
			.chain(Some((
				"_path",
				Cow::Owned(SimpleValue::Text(self.image_path.clone())),
			)));

		Ok(Box::new(attrs))
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct OtherTag {
	tag: String,

	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	children: Vec<ChildTag>,

	#[serde(default)]
	text: String,
}

impl TagLike for OtherTag {
	fn tag_name(&self) -> &str {
		&self.tag
	}

	fn text(&self) -> &str {
		&self.text
	}

	fn children(&self) -> &[ChildTag] {
		&self.children
	}

	fn attrs_as_values(&self, _: &Path) -> AttrKVIteratorResult {
		attrs_to_iterable_pairs(&self.attrs)
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub(crate) enum ChildTag {
	Image(ImageTag),
	Other(OtherTag),
}

impl TagLike for ChildTag {
	fn tag_name(&self) -> &str {
		match self {
			Self::Image(t) => t.tag_name(),
			Self::Other(t) => t.tag_name(),
		}
	}

	fn text(&self) -> &str {
		match self {
			Self::Image(t) => t.text(),
			Self::Other(t) => t.text(),
		}
	}

	fn children(&self) -> &[ChildTag] {
		match self {
			Self::Image(t) => t.children(),
			Self::Other(t) => t.children(),
		}
	}

	fn attrs_as_values(&self, root_dir: &Path) -> AttrKVIteratorResult {
		match self {
			Self::Image(t) => t.attrs_as_values(root_dir),
			Self::Other(t) => t.attrs_as_values(root_dir),
		}
	}
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RootTag {
	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	children: Vec<ChildTag>,

	#[serde(default)]
	text: String,
}

impl TagLike for RootTag {
	fn tag_name(&self) -> &str {
		"svg"
	}

	fn text(&self) -> &str {
		self.text.as_ref()
	}

	fn children(&self) -> &[ChildTag] {
		&self.children
	}

	fn attrs_as_values(&self, _: &Path) -> AttrKVIteratorResult {
		// If JSON didn't set "xmlns", we add it to the attr list with a value of
		// "http://www.w3.org/2000/svg" to get `xmlns="http://www.w3.org/2000/svg"` in
		// the output. I think you need this for SVGs to not be treated as XML by some
		// browsers?
		if !self.attrs.contains_key("xmlns") {
			Ok(Box::new(
				self.attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
					.chain(Some((
						"xmlns",
						Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
					)))
					.chain(Some((
						"xmlns:xlink",
						Cow::Owned(SimpleValue::Text(
							"http://www.w3.org/1999/xlink".to_string(),
						)),
					))),
			))
		} else {
			Ok(Box::new(
				self.attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
			))
		}
	}
}
