mod data_types;

use data_types::SimpleValue;

use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Result as XmlResult, Writer,
};

use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::{io::Cursor, rc::Rc};

pub(crate) type XmlAttrs = HashMap<String, SimpleValue>;
type AttrValueIterator<'a> = Box<dyn Iterator<Item = (&'a str, Cow<'a, SimpleValue>)> + 'a>;
type AttrStringIterator<'a> = Box<dyn Iterator<Item = (&'a str, String)> + 'a>;

fn attrs_to_iterable_pairs(attrs: &XmlAttrs) -> AttrValueIterator {
	Box::from(attrs.iter().map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))))
}

trait TagLike {
	fn tag(&self) -> &str;
	fn text(&self) -> &str;
	fn children(&self) -> Option<&[Rc<ChildTag>]>;
	fn attrs_raw<'a>(&'a self) -> Box<dyn Iterator<Item = (&str, Cow<'_, SimpleValue>)> + 'a>;

	fn attrs(&self) -> AttrStringIterator {
		use SimpleValue::*;

		Box::from(self.attrs_raw().into_iter().filter_map(|(k, v)| {
			let v_maybe_string = match &*v {
				Number(x) => Some(x.to_string()),
				Text(s) => Some((*s).to_string()),
				Present => Some("".to_owned()),
				Absent => None,
			};

			v_maybe_string.map(|v_string| (k, v_string))
		}))
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
		children: Vec<Rc<ChildTag>>,

		#[serde(default)]
		text: String,
	},
}

impl TagLike for ChildTag {
	fn tag(&self) -> &str {
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

	fn children(&self) -> Option<&[Rc<ChildTag>]> {
		match self {
			Self::Other { children, .. } => Some(children),
			Self::Image { .. } => None,
		}
	}

	fn attrs_raw<'a>(&'a self) -> Box<dyn Iterator<Item = (&str, Cow<'_, SimpleValue>)> + 'a> {
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

				Box::new(attrs)
			}
		}
	}
}

#[derive(Serialize, Deserialize)]
pub(crate) struct RootTag {
	#[serde(default)]
	attrs: XmlAttrs,

	#[serde(default)]
	children: Vec<Rc<ChildTag>>,

	#[serde(default)]
	text: String,
}

impl TagLike for RootTag {
	fn tag(&self) -> &str {
		"svg"
	}

	fn text(&self) -> &str {
		self.text.as_ref()
	}

	fn children(&self) -> Option<&[Rc<ChildTag>]> {
		Some(&self.children)
	}

	fn attrs_raw<'a>(&'a self) -> Box<dyn Iterator<Item = (&str, Cow<'_, SimpleValue>)> + 'a> {
		// If JSON didn't set "xmlns", we add it to the attr list with a value of
		// "http://www.w3.org/2000/svg" to get `xmlns="http://www.w3.org/2000/svg"` in
		// the output. I think you need this for SVGs to not be treated as XML by some
		// browsers?
		if !self.attrs.contains_key("xmlns") {
			let xmlns_attr: (&str, Cow<SimpleValue>) = (
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			);
			// Skip over
			Box::new(
				self.attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
					.chain(Some(xmlns_attr)),
			)
		} else {
			Box::new(
				self.attrs
					.iter()
					.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v))),
			)
		}

		// Prepend to the attr list so that people can override it, if they want
	}
}

enum TagWrapper {
	Root(Rc<RootTag>),
	Child(Rc<ChildTag>),
}

impl TagWrapper {
	fn tag(&self) -> &str {
		match self {
			Self::Root(root) => root.tag(),
			Self::Child(child) => child.tag(),
		}
	}

	fn text(&self) -> &str {
		match self {
			Self::Root(root) => root.text(),
			Self::Child(child) => child.text(),
		}
	}

	fn children(&self) -> Option<&[Rc<ChildTag>]> {
		match self {
			Self::Root(root) => root.children(),
			Self::Child(child) => child.children(),
		}
	}

	fn attrs(&self) -> AttrStringIterator<'_> {
		match self {
			Self::Root(root) => root.attrs(),
			Self::Child(child) => child.attrs(),
		}
	}
}

impl RootTag {
	fn into_svg_through_writer(self, writer: &mut Writer<Cursor<Vec<u8>>>) -> XmlResult<()> {
		// These variants mimic the quick_xml::event types `BytesStart`, `BytesEnd`, `BytesText`
		// TODO: quick_xml also defines BytesDecl, but it looks like that's an XML thing, not SVG; necessary here?
		// TODO: and what about EOF and others?
		enum SvgEvent {
			Start,
			Text,
			End,
		}

		let mut tag_event_stack = vec![(TagWrapper::Root(Rc::new(self)), SvgEvent::Start)];

		while let Some((curr_tag, op)) = tag_event_stack.pop() {
			match op {
				SvgEvent::Start => {
					// Create bare elem for this tag, which we'll fill below
					let tag_name = curr_tag.tag();
					let bytes = tag_name.as_bytes();
					let mut curr_elem = BytesStart::owned(bytes, bytes.len());

					// Add the attributes, then write the opening tag
					let attributes: Vec<(&str, String)> = curr_tag.attrs().collect();
					println!("{:?}", &attributes);
					curr_elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_ref())));
					writer.write_event(XmlEvent::Start(curr_elem))?;

					// Push a closing tag onto the stack, then a text tag (remember these get applied LIFO)
					for event in vec![SvgEvent::End, SvgEvent::Text].into_iter() {
						match curr_tag {
							TagWrapper::Root(ref root) => {
								tag_event_stack.push((TagWrapper::Root(Rc::clone(root)), event));
							}
							TagWrapper::Child(ref child) => {
								tag_event_stack.push((TagWrapper::Child(Rc::clone(child)), event));
							}
						}
					}

					// Push the children
					match curr_tag.children() {
						None => {}
						Some(children) => {
							for child in children.iter() {
								tag_event_stack
									.push((TagWrapper::Child(Rc::clone(child)), SvgEvent::Start))
							}
							// for child in children.iter() {
							// 	let wrapped = TagWrapper::Child(Rc::clone(child));
							// 	tag_event_stack.push((wrapped, SvgEvent::Start));
							// }
						}
					}
				}
				SvgEvent::Text => {
					writer
						.write_event(XmlEvent::Text(BytesText::from_plain_str(curr_tag.text())))?;
				}
				SvgEvent::End => writer
					.write_event(XmlEvent::End(BytesEnd::borrowed(curr_tag.tag().as_bytes())))?,
			}
		}

		Ok(())
	}

	pub fn into_svg(self) -> XmlResult<String> {
		let mut writer = Writer::new(Cursor::new(Vec::new()));
		self.into_svg_through_writer(&mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}
