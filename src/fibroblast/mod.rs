mod data_types;

use data_types::SimpleValue;

use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Writer,
};

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::io::Cursor;

use crate::decode::decoding_error::ClgnDecodingResult;

pub(crate) type XmlAttrs = HashMap<String, SimpleValue>;
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
	fn attrs_raw(&self) -> AttrKVIteratorResult;

	fn attrs<'a>(&'a self) -> ClgnDecodingResult<Box<dyn Iterator<Item = (&'a str, String)> + 'a>> {
		use SimpleValue::*;

		let attrs_raw = self.attrs_raw()?;
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
		writer: &mut Writer<Cursor<Vec<u8>>>,
	) -> ClgnDecodingResult<()> {
		let tag_name = self.tag_name();
		let tag_name_bytes = tag_name.as_bytes();
		let mut curr_elem = BytesStart::borrowed_name(tag_name_bytes);

		let attributes = self.attrs()?.collect::<Vec<_>>();
		curr_elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_ref())));
		writer.write_event(XmlEvent::Start(curr_elem))?;

		for child in self.children() {
			child.to_svg_through_writer(writer)?;
		}

		writer.write_event(XmlEvent::Text(BytesText::from_plain_str(self.text())))?;
		writer.write_event(XmlEvent::End(BytesEnd::borrowed(tag_name_bytes)))?;

		Ok(())
	}

	fn to_svg(&self) -> ClgnDecodingResult<String> {
		let mut writer = Writer::new(Cursor::new(Vec::new()));
		self.to_svg_through_writer(&mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum ChildTag {
	Image {
		path: String,

		#[serde(default)]
		attrs: XmlAttrs,
	},

	Other {
		tag: String,

		#[serde(default)]
		attrs: XmlAttrs,

		#[serde(default)]
		children: Vec<ChildTag>,

		#[serde(default)]
		text: String,
	},
}

impl TagLike for ChildTag {
	fn tag_name(&self) -> &str {
		match self {
			Self::Image { .. } => "img",
			Self::Other { tag, .. } => tag,
		}
	}

	fn text(&self) -> &str {
		match self {
			Self::Image { .. } => "",
			Self::Other { text, .. } => text,
		}
	}

	fn children(&self) -> &[ChildTag] {
		match self {
			Self::Other { children, .. } => children,
			Self::Image { .. } => &[],
		}
	}

	fn attrs_raw(&self) -> AttrKVIteratorResult {
		match self {
			Self::Other { attrs, .. } => attrs_to_iterable_pairs(attrs),

			Self::Image { attrs, path } => {
				// TODO: Implement logic!
				// Taken from https://github.com/mathiasbynens/small/blob/master/png-truncated.png -- the smallest PNG possible
				let src_str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQAB";

				let attrs = attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
					.chain(Some((
						"src",
						Cow::Owned(SimpleValue::Text(src_str.to_owned())),
					)))
					.chain(Some((
						"_path",
						Cow::Owned(SimpleValue::Text(path.to_owned())),
					)));

				Ok(Box::new(attrs))
			}
		}
	}
}

#[derive(Serialize, Deserialize)]
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

	fn attrs_raw(&self) -> AttrKVIteratorResult {
		// If JSON didn't set "xmlns", we add it to the attr list with a value of
		// "http://www.w3.org/2000/svg" to get `xmlns="http://www.w3.org/2000/svg"` in
		// the output. I think you need this for SVGs to not be treated as XML by some
		// browsers?
		if !self.attrs.contains_key("xmlns") {
			let xmlns_attr: (&str, Cow<SimpleValue>) = (
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			);
			Ok(Box::new(
				self.attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
					.chain(Some(xmlns_attr)),
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
