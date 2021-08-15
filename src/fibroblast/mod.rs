use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Result as XmlResult, Writer,
};

use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use std::borrow::Cow;
use std::{collections::HashMap, marker::PhantomData};
use std::{io::Cursor, rc::Rc};

// mod xml_elems {
// 	use quick_xml::{
// 		events::{BytesEnd, BytesStart, Event as XmlEvent},
// 		Result as XmlResult, Writer,
// 	};
// 	use serde::{de::Visitor, Deserialize, Deserializer, Serialize, Serializer};
// 	use std::borrow::Cow;
// 	use std::collections::HashMap;
// 	use std::io::Cursor;
// 	use std::iter::FilterMap;
// 	use std::marker::PhantomData;

type StringDict<V> = HashMap<String, V>;

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Value<'a> {
	Dict(StringDict<Value<'a>>),
	List(Vec<Value<'a>>),

	#[serde(borrow)]
	Simple(SimpleValue<'a>),
}

enum SimpleValue<'a> {
	Number(ConcreteNumber),
	Text(Cow<'a, str>),
	Present,
	Absent,
}

impl<'a> Clone for SimpleValue<'a> {
	fn clone(&self) -> Self {
		use SimpleValue::*;

		match self {
			Number(x) => Number(*x),
			Text(s) => Text(s.to_owned()),
			Present => Present,
			Absent => Absent,
		}
	}
}

#[derive(Clone, Copy)]
enum ConcreteNumber {
	Int(i64),
	UInt(u64),
	Float(f64),
}

impl std::fmt::Display for ConcreteNumber {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use self::ConcreteNumber::*;
		let s = match self {
			Int(x) => x.to_string(),
			UInt(x) => x.to_string(),
			Float(x) => x.to_string(),
		};
		f.write_str(s.as_str())
	}
}

impl<'a> Serialize for SimpleValue<'a> {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		use self::ConcreteNumber::*;
		use self::SimpleValue::*;

		match self {
			Number(Int(x)) => serializer.serialize_i64(*x),
			Number(UInt(x)) => serializer.serialize_u64(*x),
			Number(Float(x)) => serializer.serialize_f64(*x),
			Text(s) => serializer.serialize_str(s),
			Present => serializer.serialize_bool(true),
			Absent => serializer.serialize_bool(false),
		}
	}
}

struct SimpleValueVisitor<'a>(PhantomData<fn() -> SimpleValue<'a>>);

impl<'de> de::Visitor<'de> for SimpleValueVisitor<'de> {
	type Value = SimpleValue<'de>;

	fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
		formatter.write_str("Expecting a string, a number, a bool, or `null`")
	}

	fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(SimpleValue::Text(Cow::Owned(v.to_owned())))
	}

	fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(SimpleValue::Number(ConcreteNumber::Int(v)))
	}

	fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(SimpleValue::Number(ConcreteNumber::UInt(v)))
	}

	fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(SimpleValue::Number(ConcreteNumber::Float(v)))
	}

	fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
	where
		E: serde::de::Error,
	{
		Ok(if v {
			SimpleValue::Present
		} else {
			SimpleValue::Absent
		})
	}
}

impl<'a, 'de: 'a> Deserialize<'de> for SimpleValue<'a> {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		deserializer.deserialize_any(SimpleValueVisitor(PhantomData))
	}
}

// pub trait XmlElement {
// 	fn tag<'a>(&'a self) -> Cow<'a, str>;
// 	fn attrs(&self) -> &StringDict<SimpleValue>;
// 	fn children(&self) -> &Vec<FibroblastChild>;
// 	fn text<'a>(&'a self) -> &'a str;
// }

#[derive(Serialize, Deserialize)]
pub struct XmlAttrs<'a>(#[serde(borrow)] Vec<(String, SimpleValue<'a>)>);

#[derive(Serialize)]
pub(crate) enum Fibroblast<'a> {
	Root {
		attrs: XmlAttrs<'a>,
		children: Vec<Fibroblast<'a>>,
		text: String,
	},

	Image {
		attrs: XmlAttrs<'a>,
		path: String,
	},

	Other {
		tag: String,
		attrs: XmlAttrs<'a>,
		children: Vec<Fibroblast<'a>>,
		text: String,
	},
}

// These variants mimic the quick_xml::event types `BytesStart`, `BytesEnd`, `BytesText`
// TODO: quick_xml also defines BytesDecl, but it looks like that's an XML thing, not SVG; necessary here?
enum SvgEvent {
	Start,
	Text,
	End,
}

impl<'a> Fibroblast<'a> {
	fn tag(&'a self) -> &'a str {
		match self {
			Self::Root { .. } => "svg",
			Self::Image { .. } => "img",
			Self::Other { tag, .. } => tag.as_ref(),
		}
	}

	fn text(&'a self) -> &'a str {
		match self {
			Self::Root { text, .. } | Self::Other { text, .. } => text.as_ref(),
			Self::Image { .. } => "",
		}
	}

	fn children(&'a self) -> Option<std::slice::Iter<'a, Fibroblast<'a>>> {
		match self {
			Self::Root { children, .. } | Self::Other { children, .. } => Some(children.iter()),
			Self::Image { .. } => None,
		}
	}

	fn attrs_raw(&'a self) -> Box<dyn Iterator<Item = (&'a str, SimpleValue<'a>)> + 'a> {
		match self {
			Self::Root { attrs, .. } | Self::Other { attrs, .. } => {
				Box::from(attrs.0.iter().map(|(k, v)| (k.as_ref(), v.clone())))
			}
			Self::Image { attrs, path } => {
				// TODO: Implement logic!
				// Taken from https://github.com/mathiasbynens/small/blob/master/png-truncated.png -- the smallest PNG possible
				let src_str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQAB";

				let attrs = attrs
					.0
					.iter()
					.map(|(k, v)| (k.as_ref(), v.to_owned()))
					.chain(Some(("src", SimpleValue::Text(Cow::Borrowed(src_str)))))
					.chain(Some(("_path", SimpleValue::Text(Cow::Borrowed(path)))));

				Box::new(attrs)
			}
		}
	}

	fn attrs(&'a self) -> Box<dyn Iterator<Item = (&'a str, String)> + 'a> {
		use SimpleValue::*;

		Box::from(self.attrs_raw().into_iter().filter_map(|(k, v)| {
			let v_maybe_string = match v {
				Number(x) => Some(x.to_string()),
				Text(s) => Some((*s).to_owned()),
				Present => Some("".to_owned()),
				Absent => None,
			};

			v_maybe_string.map(|v_string| (k, v_string))
		}))
	}

	fn into_svg_through_writer(self, writer: &mut Writer<Cursor<Vec<u8>>>) -> XmlResult<()> {
		let mut tag_event_stack = vec![(Rc::new(&self), SvgEvent::Start)];

		while let Some((curr_fbc, op)) = tag_event_stack.pop() {
			match op {
				SvgEvent::Start => {
					// Create bare elem for this tag, which we'll fill below
					let tag_name = curr_fbc.tag();
					let bytes = tag_name.as_bytes();
					let mut curr_elem = BytesStart::owned(bytes, bytes.len());

					// Add the attributes, then write the opening tag
					let attributes: Vec<(&str, String)> = curr_fbc.attrs().collect();
					curr_elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_ref())));
					writer.write_event(XmlEvent::Start(curr_elem))?;

					// Push a closing tag onto the stack, then a text tag (remember these get applied LIFO)
					tag_event_stack.push((Rc::clone(&curr_fbc), SvgEvent::End));
					tag_event_stack.push((Rc::clone(&curr_fbc), SvgEvent::Text));

					// Push the children
					match curr_fbc.children() {
						None => {}
						Some(children) => {
							for child in children {
								tag_event_stack.push((Rc::new(child), SvgEvent::Start));
							}
						}
					}
				}
				SvgEvent::Text => {
					writer
						.write_event(XmlEvent::Text(BytesText::from_plain_str(curr_fbc.text())))?;
				}
				SvgEvent::End => writer
					.write_event(XmlEvent::End(BytesEnd::borrowed(curr_fbc.tag().as_bytes())))?,
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

// pub trait Fibroblast2<'a> {
// 	fn tag(&'a self) -> Cow<'a, str>;
// 	fn attrs_raw(&'a self) -> Box<dyn Iterator<Item = (&'a str, &SimpleValue<'a>)> + 'a>;
// 	fn children(&'a self) -> Option<&XmlChildren>;
// 	fn text(&'a self) -> Cow<'a, str>;

// 	fn attrs(&'a self) -> Box<dyn Iterator<Item = (&'a str, String)> + 'a> {
// 		use SimpleValue::*;

// 		Box::from(self.attrs_raw().into_iter().filter_map(|(k, v)| {
// 			let v_maybe_string = match v {
// 				Number(x) => Some(x.to_string()),
// 				Text(s) => Some((*s).to_owned()),
// 				Present => Some("".to_owned()),
// 				Absent => None,
// 			};

// 			v_maybe_string.map(|v_string| (k, v_string))
// 		}))
// 	}

// 	fn to_svg_into_writer(&'a self, writer: &mut Writer<Cursor<Vec<u8>>>) -> XmlResult<()>
// 	where
// 		Self: Sized,
// 	{
// 		// These variants mimic the quick_xml::event types `BytesStart`, `BytesEnd`, `BytesText`
// 		// TODO: quick_xml also defines BytesDecl, but it looks like that's an XML thing, not SVG; necessary here?

// 		let mut tag_stack = Vec::<(Rc<&dyn Fibroblast>, SvgEvent)>::new();

// 		tag_stack.push((Rc::new(self), SvgEvent::Start));

// 		loop {
// 			match tag_stack.pop() {
// 				None => break,

// 				// `fbc` is short for FibroblastChild
// 				Some((curr_fbc, op)) => {
// 					match op {
// 						SvgEvent::Start => {
// 							// Create bare elem for this tag, which we'll fill below

// 							let tag = curr_fbc.tag();
// 							let bytes = tag.as_bytes();
// 							let mut curr_elem = BytesStart::owned(bytes, bytes.len());

// 							// Add the attributes, then write the opening tag
// 							let attributes: Vec<(&str, String)> = curr_fbc.attrs().collect();

// 							//.map(|(k, v)| (k, v.as_ref() as &str));
// 							curr_elem.extend_attributes(
// 								attributes.iter().map(|(k, v)| (*k, v.as_ref())),
// 							);
// 							writer.write_event(XmlEvent::Start(curr_elem))?;

// 							// Push a closing tag onto the stack, then a text tag (remember these get applied LIFO)
// 							tag_stack.push((Rc::clone(&curr_fbc), SvgEvent::End));
// 							tag_stack.push((Rc::clone(&curr_fbc), SvgEvent::Text));

// 							// Push the children
// 							match curr_fbc.children() {
// 								None => {}
// 								Some(children) => {
// 									for child in children.0.iter() {
// 										tag_stack.push((Rc::new(child.as_ref()), SvgEvent::Start));
// 									}
// 								}
// 							}
// 						}
// 						SvgEvent::Text => {
// 							writer.write_event(XmlEvent::Text(BytesText::from_plain_str(
// 								curr_fbc.text().as_ref(),
// 							)))?;
// 						}
// 						SvgEvent::End => writer.write_event(XmlEvent::End(BytesEnd::borrowed(
// 							curr_fbc.text().as_bytes(),
// 						)))?,
// 					}
// 				}
// 			}
// 		}

// 		Ok(())
// 	}

// 	fn to_svg(&'a self) -> XmlResult<String>
// 	where
// 		Self: Sized,
// 	{
// 		let mut writer = Writer::new(Cursor::new(Vec::new()));
// 		self.to_svg_into_writer(&mut writer)?;

// 		let buf = writer.into_inner().into_inner();
// 		let out_string = std::str::from_utf8(&buf)?.to_owned();

// 		Ok(out_string)
// 	}
// }

// #[derive(Serialize, Deserialize)]
// pub struct RootTag<'a> {
// 	#[serde(rename = "attrs")]
// 	_attrs: XmlAttrs<'a>,

// 	#[serde(borrow)]
// 	#[serde(rename = "children")]
// 	_children: XmlChildren<'a>,

// 	#[serde(rename = "text")]
// 	_text: String,
// }

// #[typetag::serialize]
// impl<'a> Fibroblast<'a> for RootTag<'a> {
// 	fn tag(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed("svg")
// 	}

// 	fn attrs_raw(&'a self) -> Box<dyn Iterator<Item = (&'a str, &SimpleValue)> + 'a> {
// 		Box::from(self._attrs.0.iter().map(|(k, v)| (k.as_ref(), v)))
// 	}

// 	fn children(&'a self) -> Option<&XmlChildren> {
// 		Some(&self._children)
// 	}

// 	fn text(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed(&self._text)
// 	}
// }

// #[derive(Serialize, Deserialize)]
// pub struct AnyTag<'a> {
// 	_tag: String,

// 	#[serde(borrow)]
// 	_attrs: XmlAttrs<'a>,

// 	#[serde(borrow)]
// 	_children: XmlChildren<'a>,

// 	_text: String,
// }

// #[typetag::serialize]
// impl<'a> Fibroblast<'a> for AnyTag<'a> {
// 	fn tag(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed(&self._tag)
// 	}

// 	fn attrs_raw(&'a self) -> Box<dyn Iterator<Item = (&'a str, &SimpleValue)> + 'a> {
// 		Box::from(self._attrs.0.iter().map(|(k, v)| (k.as_ref(), v)))
// 	}

// 	fn children(&'a self) -> Option<&XmlChildren> {
// 		Some(&self._children)
// 	}

// 	fn text(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed(&self._text)
// 	}
// }

// #[derive(Serialize, Deserialize)]
// pub struct ImgTag<'a> {
// 	#[serde(borrow)]
// 	_attrs: XmlAttrs<'a>,

// 	_path: String,
// }

// #[typetag::serialize]
// impl<'a> Fibroblast<'a> for ImgTag<'a> {
// 	fn tag(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed("img")
// 	}

// 	fn attrs_raw(&'a self) -> Box<dyn Iterator<Item = (&'a str, &SimpleValue)> + 'a> {
// 		// TODO: Implement logic!
// 		// Taken from https://github.com/mathiasbynens/small/blob/master/png-truncated.png -- the smallest PNG possible
// 		let src_str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQAB";

// 		let attrs = self
// 			._attrs
// 			.0
// 			.iter()
// 			.map(|(k, v)| (k.as_ref(), v.clone()))
// 			.chain(Some(("src", &SimpleValue::Text(src_str))))
// 			.chain(Some(("_path", &SimpleValue::Text(&self._path))));

// 		Box::new(attrs)
// 	}

// 	fn children(&self) -> Option<&XmlChildren> {
// 		None
// 	}

// 	fn text(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed("")
// 	}
// }

// impl XmlElement for FibroblastChild {
// 	fn tag<'a>(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed(&self._tag)
// 	}

// 	fn attrs(&self) -> &XmlAttrs {
// 		&self._attrs
// 	}

// 	fn children(&self) -> &XmlChildren {
// 		&self._children
// 	}

// 	fn text<'a>(&'a self) -> &'a str {
// 		&self._text
// 	}
// }

// impl FibroblastChild {
// 	pub fn attrs_to_key_value_pairs<'a>(
// 		&'a self,
// 	) -> impl IntoIterator<Item = (&str, Cow<'a, str>)> {
// 		self::static_fns::attrs_to_key_value_pairs(self)
// 	}

// 	pub fn to_svg_into_writer<'a>(&'a self, writer: Writer<Cursor<Vec<u8>>>) -> XmlResult<()> {
// 		// These variants mimic the quick_xml::event types `BytesStart`, `BytesEnd`, `BytesText`
// 		// TODO: quick_xml also defines BytesDecl, but it looks like that's an XML thing, not SVG; necessary here?
// 		enum SvgEvent {
// 			Start,
// 			Text,
// 			End,
// 		}

// 		let mut tag_stack = Vec::<(&FibroblastChild, SvgEvent)>::new();

// 		tag_stack.push((&self, SvgEvent::Start));

// 		loop {
// 			match tag_stack.pop() {
// 				// `fbc` is short for FibroblastChild
// 				Some((curr_fbc, op)) => {
// 					match op {
// 						SvgEvent::Start => {
// 							// Create bare elem for this tag, which we'll fill below
// 							let bytes = curr_fbc.tag().as_bytes();
// 							let mut this_elem = BytesStart::owned(bytes, bytes.len());

// 							// Add the attributes, then write the opening tag
// 							let attributes: Vec<(&str, Cow<'a, str>)> =
// 								curr_fbc.attrs_to_key_value_pairs().into_iter().collect();
// 							this_elem.extend_attributes(
// 								attributes.iter().map(|(k, v)| (*k, v.as_ref())),
// 							);
// 							writer.write_event(XmlEvent::Start(this_elem))?;

// 							// Push a text tag onto the stack, then a closing tag
// 							// These will be popped after any children elements
// 							tag_stack.push((&curr_fbc, SvgEvent::Text));
// 							tag_stack.push((&curr_fbc, SvgEvent::End));

// 							// Push the children
// 							for child in curr_fbc.children().iter() {
// 								tag_stack.push((child, SvgEvent::Start));
// 							}
// 						}
// 						SvgEvent::Text => {}
// 						Op::Close => {
// 							let bytes = self.tag().as_bytes();
// 							let this_elem = BytesEnd::boro(bytes, bytes.len());
// 						}
// 					}

// 					tag_stack
// 				}
// 				None => break,
// 			}
// 		}

// 		writer.write_event(Event::End(BytesEnd::borrowed(self.tag().as_bytes())))?;
// 		writer.write_event(Event::Eof)?;

// 		let buf = writer.into_inner().into_inner();
// 		let out_string = std::str::from_utf8(&buf)?;

// 		Ok(())
// 	}
// }

// #[derive(Serialize, Deserialize)]
// pub struct Fibroblast {
// 	_attrs: xml_elems::XmlAttrs,
// 	_children: xml_elems::XmlChildren,
// }

// impl xml_elems::XmlElement for Fibroblast {
// 	fn tag<'a>(&'a self) -> Cow<'a, str> {
// 		Cow::Borrowed("svg")
// 	}

// 	fn attrs(&self) -> &xml_elems::XmlAttrs {
// 		&self._attrs
// 	}

// 	fn children(&self) -> &xml_elems::XmlChildren {
// 		&self._children
// 	}
// }

// impl Fibroblast {
// 	pub fn attrs_to_key_value_pairs<'a>(
// 		&'a self,
// 	) -> impl IntoIterator<Item = (&str, Cow<'a, str>)> {
// 		xml_elems::static_fns::attrs_to_key_value_pairs(self)
// 	}
// }

// impl Fibroblast {
// 	fn attrs_to_key_value_pairs<I>(&self) -> impl IntoIterator<Item = (&str, String)> {
// 		use self::SimpleValue::*;

// 		self.attrs().iter().filter_map(|(k, v)| {
// 			let v_maybe_string = match v {
// 				Number(x) => Some(x.to_string()),
// 				Text(s) => Some((*s).to_owned()),
// 				Present => Some("".to_owned()),
// 				Absent | Unspecified => None,
// 			};

// 			v_maybe_string.map(|v_string| (k.as_str(), v_string))
// 		})
// 	}
// }

// impl XmlElement for Fibroblast {
// 	fn tag<'a>(&self) -> Cow<'a, str> {
// 		Cow::Borrowed("svg")
// 	}

// 	fn attrs(&self) -> &StringDict<SimpleValue> {
// 		&self._attrs
// 	}

// 	fn children(&self) -> &Vec<FibroblastChild> {
// 		&self._children
// 	}

// pub fn to_svg() -> XmlResult<String> {
// 	let mut writer = Writer::new(Cursor::new(Vec::new()));
// 	let mut elem = BytesStart::owned(self.tag().as_bytes(), self.tag().len());
// 	let attributes: Vec<(&str, String)> = self.attrs_to_key_value_pairs().into_iter().collect();

// 	elem.extend_attributes(attributes.iter().map(|(k, v)| (*k, v.as_str())));
// 	writer.write_event(Event::Start(elem))?;
// 	writer.write_event(Event::End(BytesEnd::borrowed(self.tag().as_bytes())))?;
// 	writer.write_event(Event::Eof)?;

// 	let buf = writer.into_inner().into_inner();
// 	let out_string = std::str::from_utf8(&buf)?;

// 	Ok(out_string.to_owned())
// }
// }
