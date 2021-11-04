//! For writing the in-memory representation to SVG. At some point I would like to
//! implement https://serde.rs/transcode.html, using `serde` to stream straight from
//! JSON to SVG (XML). I don't think it should be *that* hard.

use crate::fibroblast::{
	data_types::DecodingContext,
	tags::{AnyChildTag, RootTag},
	Fibroblast, TagLike,
};
pub(crate) use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent};
use quick_xml::Writer as XmlWriter;

use std::fmt::Debug;
use std::io::Cursor;

/// Writes `tag` to SVG (aka XML) through an `XmlWriter`, with a `DecodingContext`.
/// Calls `write_children` when it's time to write the children
///
/// Note that this is *not* just a copy-paste of [`roottag_to_svg_through_writer_with`],
/// which takes a [`RootTag`] instead of an [`AnyChildTag`] and therefore some of the
/// variables are of different type (i.e., where this function uses `f()?`,
/// [`roottag_to_svg_through_writer_with`] might use `f()`.)
fn tag_to_svg_through_writer_with<'a, T, W, F>(
	tag: &'a T,
	context: &'a DecodingContext<'a>,
	writer: &mut XmlWriter<W>,
	write_children: F,
) -> ClgnDecodingResult<()>
where
	T: TagLike<'a>,
	W: std::io::Write,
	F: FnOnce(&mut XmlWriter<W>) -> ClgnDecodingResult<()>,
{
	let tag_name_bytes = tag.tag_name().as_bytes();

	// Open the tag (write e.g., `<rect attr1="val1">`)

	let mut curr_elem = BytesStart::borrowed_name(tag_name_bytes);

	// Write the tag's children and text
	context.with_new_vars(tag.vars(context)?, || {
		let attr_values = tag.attrs(context)?;
		let attr_strings = attr_values
			.iter()
			.filter_map(|(k, v)| v.to_maybe_string().map(|s| (*k, s)))
			.collect::<Vec<_>>();

		curr_elem.extend_attributes(attr_strings.iter().map(|(k, v)| (*k, v.as_ref())));
		writer.write_event(XmlEvent::Start(curr_elem))?;
		let text = tag.text(context)?;

		write_children(writer)?;
		writer.write_event(XmlEvent::Text(if tag.should_encode_text() {
			BytesText::from_plain_str(&*text)
		} else {
			BytesText::from_escaped((&*text).as_bytes())
		}))?;
		Ok(())
	})?;

	// Close the tag
	writer.write_event(XmlEvent::End(BytesEnd::borrowed(tag_name_bytes)))?;

	Ok(())
}

pub trait SvgWritableTag<'a> {
	/// Convert the in-memory representation of a Fibroblast to SVG. `writer` determines
	/// where the output goes -- a `String`, to a file, etc.
	fn to_svg_through_writer<W: std::io::Write>(
		&'a self,
		context: &'a DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
	) -> ClgnDecodingResult<()>
	where
		Self: Debug;

	fn to_svg_string(&'a self, context: &'a DecodingContext<'a>) -> ClgnDecodingResult<String>
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

impl<'a> SvgWritableTag<'a> for AnyChildTag<'a> {
	fn to_svg_through_writer<W: std::io::Write>(
		&'a self,
		context: &'a DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
	) -> ClgnDecodingResult<()>
	where
		Self: Debug,
	{
		tag_to_svg_through_writer_with(self, context, writer, |writer| {
			match &self {
				AnyChildTag::Container(container) => {
					let fb = container.as_fibroblast();
					context.with_new_root(fb.context.get_root().as_path(), || {
						for child in self.children(context)? {
							child.to_svg_through_writer(context, writer)?;
						}
						Ok(())
					})?;
				}
				_ => {
					context.with_new_vars(self.vars(context)?, || {
						for child in self.children(context)? {
							child.to_svg_through_writer(context, writer)?;
						}
						Ok(())
					})?;
				}
			};

			Ok(())
		})
	}
}

impl<'a> SvgWritableTag<'a> for RootTag<'a> {
	fn to_svg_through_writer<W: std::io::Write>(
		&'a self,
		context: &'a DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
	) -> ClgnDecodingResult<()>
	where
		Self: Debug,
	{
		tag_to_svg_through_writer_with(self, context, writer, |writer| {
			for child in self.children() {
				child.to_svg_through_writer(context, writer)?;
			}

			Ok(())
		})
	}
}

impl<'a> Fibroblast<'a> {
	pub fn to_svg_through_writer<W: std::io::Write>(
		&'a self,
		writer: &mut XmlWriter<W>,
	) -> ClgnDecodingResult<()> {
		self.root.to_svg_through_writer(&self.context, writer)
	}
}
