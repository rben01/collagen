//! For writing the in-memory representation to SVG. At some point I would like to
//! implement https://serde.rs/transcode.html, using `serde` to stream straight from
//! JSON to SVG (XML). I don't think it should be *that* hard.

use crate::fibroblast::TagVariables;
use crate::fibroblast::{data_types::SimpleValue, ChildTag, ImageTag, OtherTag, RootTag, TagLike};
pub(crate) use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};

use lazy_static::lazy_static;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent};
use quick_xml::Writer as XmlWriter;
use regex::Regex;
use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::VecDeque;
use std::fmt::Debug;
use std::io::Cursor;
use std::path::Path;

lazy_static! {
	static ref VAR_NAME_CHAR_RE: Regex = Regex::new(r#"[\w_-]"#).unwrap();
}

#[derive(Debug)]
pub(crate) struct DecodingContext<'a> {
	root_path: &'a Path,
	vars_stack: RefCell<VecDeque<&'a TagVariables>>,
}

#[derive(Debug)]
pub(crate) enum VariableSubstitutionError {
	IllegalVariableName(String),
	VariableNotFound(String),
	UnterminatedVariableName(String),
}

/// A vector of key, value pairs representing attributes
type AttrKVValueVec<'a> = Vec<(&'a str, Cow<'a, SimpleValue>)>;

fn _replace_vars_with_values<'a>(
	s: &'a str,
	context: &'a DecodingContext,
) -> Result<String, VariableSubstitutionError> {
	let vars_stack = context.vars_stack.borrow();
	if vars_stack.len() == 0 {
		return Ok(s.to_owned());
	}

	enum ParseState {
		Normal,
		InsideBracesValid,
		InsideBracesInvalid,
	}
	use ParseState::*;

	let mut string_result = String::new();

	let mut parse_state = ParseState::Normal;
	let mut prev_was_backslash = false;
	let mut left = 0;

	// let mut push_part_til_here = |i: usize, c: char| {
	// 	string_result.push_str(&s[left..i]);
	// 	left = i + c.len_utf8();
	// };

	for (i, c) in s.chars().into_iter().enumerate() {
		match (prev_was_backslash, &parse_state, c) {
			(false, _, '\\') => {
				prev_was_backslash = true;
			}
			(false, Normal, '{') => {
				string_result.push_str(&s[left..i]);
				left = i + c.len_utf8();
				parse_state = InsideBracesValid;
			}
			(false, InsideBracesValid, '}') => {
				let var_name = &s[left..i];
				let mut var_name_was_found = false;
				for vars in vars_stack.iter() {
					if let Some(value) = vars.0.get(var_name) {
						string_result.push_str(&value.to_string());
						var_name_was_found = true;
						break;
					}
				}
				if !var_name_was_found {
					return Err(VariableSubstitutionError::VariableNotFound(
						var_name.to_string(),
					));
				}
				left = i + c.len_utf8();
				parse_state = Normal;
			}
			(false, InsideBracesValid, c) if !VAR_NAME_CHAR_RE.is_match(&c.to_string()) => {
				parse_state = InsideBracesInvalid;
			}
			(false, InsideBracesInvalid, '}') => {
				return Err(VariableSubstitutionError::IllegalVariableName(
					s[left..i].to_string(),
				));
			}
			(true, Normal, '{' | '\\') => {
				let i = i - '\\'.len_utf8();
				string_result.push_str(&s[left..i]);
				left = i + c.len_utf8();
				prev_was_backslash = false;
			}
			_ => {}
		}
	}

	match parse_state {
		Normal => {
			string_result.push_str(&s[left..]);
			Ok(string_result)
		}
		InsideBracesValid | InsideBracesInvalid => Err(
			VariableSubstitutionError::UnterminatedVariableName(s[left..].to_string()),
		),
	}
}

/// By default, getting the attrs as a list of pairs is just iterating over the
/// underlying Map, wrapping in a Cow, and collecting into a Vec
fn _default_derived_attrs<'a, T: SvgWritable + ?Sized>(
	tag: &'a T,
	context: &'a DecodingContext,
) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
	use SimpleValue::*;

	let raw_attrs = &tag.raw_attrs().0;
	let mut attrs = Vec::with_capacity(raw_attrs.len());

	for (k, v) in raw_attrs.iter() {
		let v = match v {
			Text(s) => {
				let subd_text = _replace_vars_with_values(s, context)?;
				Cow::Owned(SimpleValue::Text(subd_text))
			}
			_ => Cow::Borrowed(v),
		};

		attrs.push((k.as_ref(), v));
	}

	Ok(attrs)
}

pub(crate) trait SvgWritable: TagLike {
	/// Putting a default here is not recommended because the nesting of enum variants
	/// means a parent enum might inadvertently skip computing its children's
	/// `derived_attrs`
	fn derived_attrs<'a>(
		&'a self,
		context: &'a DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>>;

	fn derived_text(&self, context: &DecodingContext) -> ClgnDecodingResult<String> {
		let result = _replace_vars_with_values(self.text(), context)?;
		Ok(result)
	}

	/// Convert the in-memory representation of a Fibroblast to SVG. `writer` determines
	/// where the output goes -- a `String`, to a file, etc.
	fn to_svg_through_writer<'a, W: std::io::Write>(
		&'a self,
		context: &'a DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
	) -> ClgnDecodingResult<()>
	where
		Self: Debug,
	{
		let tag_name = self.tag_name();
		let tag_name_bytes = tag_name.as_bytes();
		let mut curr_elem = BytesStart::borrowed_name(tag_name_bytes);

		// If only we could avoid allocating `Vec`s here. But that's the price of having
		// `SimpleValue::to_maybe_string()` return an `Option<Cow<'_, str>>`; somebody
		// has to own something somewhere. Since the Cow is borrowing, we need to own
		// here. Having `SimpleValue::to_maybe_string()` return `String` would obviate
		// the collections here -- but then we'd be doing tons of copies *there*. Better
		// to allocate a vector or two than arbitrarily many Strings, right?

		let my_vars = self.vars();
		if let Some(vars) = my_vars {
			context.vars_stack.borrow_mut().push_front(vars);
		}
		let attr_values = self.derived_attrs(context)?;

		let attr_strings = attr_values
			.iter()
			.filter_map(|(k, v)| v.to_maybe_string().map(|s| (*k, s)))
			.collect::<Vec<_>>();

		curr_elem.extend_attributes(attr_strings.iter().map(|(k, v)| (*k, v.as_ref())));
		writer.write_event(XmlEvent::Start(curr_elem))?;

		for child in self.children() {
			child.to_svg_through_writer(context, writer)?;
		}

		if my_vars.is_some() {
			context.vars_stack.borrow_mut().pop_front();
		}

		writer.write_event(XmlEvent::Text(BytesText::from_plain_str(
			&self.derived_text(context)?,
		)))?;
		writer.write_event(XmlEvent::End(BytesEnd::borrowed(tag_name_bytes)))?;

		Ok(())
	}

	fn to_svg_string<'a>(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<String>
	where
		Self: Debug,
	{
		let mut writer = XmlWriter::new(Cursor::new(Vec::new()));
		self.to_svg_through_writer(context, &mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}

impl SvgWritable for ImageTag {
	/// Currently this reads the entire image into memory, then writes it back out.
	/// Instead, when converting to SVG, we should stream directly between input and
	/// output.
	fn derived_attrs<'a>(
		&'a self,
		context: &'a DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		let kind = self.kind();
		let kind = match kind {
			Some(extn) => extn,
			None => {
				return Err(ClgnDecodingError::Image(format!(
					r#"Could not deduce the extension from {:?}, and no "kind" was given""#,
					self.image_path()
				)));
			}
		};

		// I'd like to find the "right" way to reduce memory usage here. We're reading a
		// file into memory and then storing its b64 string also in memory. That's
		// O(2*n). Ideally none of this would reside in memory, and we'd stream directly
		// to the output SVG. An intermediate step would be to stream the file into the
		// b64 encoder, getting memory usage down to O(1*n).
		let abs_image_path = context.root_path.join(&self.image_path());
		let b64_string = base64::encode(std::fs::read(abs_image_path)?);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		let attrs = _default_derived_attrs(self, context)?
			.into_iter()
			.chain(Some(("href", Cow::Owned(SimpleValue::Text(src_str)))))
			// .chain(Some((
			// 	"_path",
			// 	Cow::Owned(SimpleValue::Text(self.image_path().to_owned())),
			// )))
			.collect();

		Ok(attrs)
	}
}

impl SvgWritable for OtherTag {
	fn derived_attrs<'a>(
		&'a self,
		context: &'a DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		_default_derived_attrs(self, context)
	}
}

impl SvgWritable for ChildTag {
	fn derived_attrs<'a>(
		&'a self,
		context: &'a DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		match self {
			Self::Image(t) => t.derived_attrs(context),
			Self::Other(t) => t.derived_attrs(context),
		}
	}
}

impl SvgWritable for RootTag {
	fn derived_attrs<'a>(
		&'a self,
		context: &'a DecodingContext,
	) -> ClgnDecodingResult<AttrKVValueVec<'a>> {
		// If JSON didn't set "xmlns", we add it to the attr list with a value of
		// "http://www.w3.org/2000/svg" to get `<svg xmlns="http://www.w3.org/2000/svg"
		// ...>` in the output. I think you need this for SVGs to not be treated as XML
		// by some browsers?

		let mut attrs = _default_derived_attrs(self, context)?;

		if !self.raw_attrs().0.contains_key("xmlns") {
			attrs.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(attrs)
	}
}

pub(crate) fn folder_to_svg_through_writer<P: AsRef<Path>, W: std::io::Write>(
	path: P,
	mut writer: &mut XmlWriter<W>,
) -> ClgnDecodingResult<()> {
	let path = path.as_ref();

	let rt = RootTag::from_dir(path)?;
	let vars_stack = VecDeque::new();

	let context = DecodingContext {
		root_path: path,
		vars_stack: RefCell::new(vars_stack),
	};

	rt.to_svg_through_writer(&context, &mut writer)
}
