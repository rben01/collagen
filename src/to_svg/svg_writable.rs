//! For writing the in-memory representation to SVG.

use crate::fibroblast::{
	data_types::DecodingContext,
	tags::{element::Node, AnyChildTag},
	Fibroblast,
};
pub(crate) use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};
use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Writer as XmlWriter,
};
use std::io::Cursor;

impl<'a> SvgWritableTag<'a> for Node<'a> {
	fn to_svg_with_child_writer<W, F>(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
		write_children: F,
	) -> ClgnDecodingResult<()>
	where
		W: std::io::Write,
		F: FnOnce(&mut XmlWriter<W>) -> ClgnDecodingResult<()>,
	{
		context.with_new_vars(vars, f);
		Ok(())
	}

	fn to_svg(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
	}
}

pub(crate) trait SvgWritableTag<'a> {
	/// Writes `tag` to SVG (aka XML) through an `XmlWriter`, with a `DecodingContext`.
	/// Calls `write_children` when it's time to write the children
	fn to_svg_with_child_writer<W, F>(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<W>,
		write_children: F,
	) -> ClgnDecodingResult<()>
	where
		W: std::io::Write,
		F: FnOnce(&mut XmlWriter<W>) -> ClgnDecodingResult<()>,
	{
		// Write the tag itself, and its children and text
		context.with_new_vars(self.vars(context)?, || {
			if let Some(tag_name) = self.tag_name() {
				// Open the tag (write e.g., `<rect`)
				let mut curr_elem = BytesStart::new(tag_name);

				let attr_values = self.attrs(context)?;

				// Write e.g., `attr1="val1"`
				for (k, v) in attr_values.iter() {
					if let Some(v) = v.to_maybe_string() {
						curr_elem.push_attribute((*k, v.as_ref()));
					}
				}

				// Finish tag, writing `>`
				writer.write_event(XmlEvent::Start(curr_elem))?;

				// Write the children
				write_children(writer)?;

				// Write the tag's text `<tag attr="val">text here`
				let text = self.bytes_text(context)?;
				writer.write_event(XmlEvent::Text(if self.should_escape_text() {
					BytesText::new(text.as_ref())
				} else {
					BytesText::from_escaped(text)
				}))?;

				// Close the tag (`</rect>`)
				writer.write_event(XmlEvent::End(BytesEnd::new(tag_name)))?;
			} else {
				write_children(writer)?;
			}

			Ok(())
		})?;

		Ok(())
	}

	/// Convert the in-memory representation of a Fibroblast to SVG. `writer` determines
	/// where the output goes -- a `String`, to a file, etc.
	fn to_svg(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()>;

	fn to_svg_string(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<String> {
		let mut writer = XmlWriter::new(Cursor::new(Vec::new()));
		self.to_svg(context, &mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}

impl<'a> SvgWritableTag<'a> for AnyChildTag<'a> {
	fn to_svg(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		self.to_svg_with_child_writer(context, writer, |writer| match &self {
			AnyChildTag::Container(container) => {
				let fb = container.as_fibroblast(context)?;
				context.with_new_root(fb.context.get_root().clone(), || {
					for child in self.children(context)? {
						child.to_svg(context, writer)?;
					}
					Ok(())
				})
			}
			_ => context.with_new_vars(self.vars(context)?, || {
				for child in self.children(context)? {
					child.to_svg(context, writer)?;
				}
				Ok(())
			}),
		})
	}
}

impl<'a> SvgWritableTag<'a> for RootTag<'a> {
	fn to_svg(
		&'a self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		self.to_svg_with_child_writer(context, writer, |writer| {
			for child in self.children() {
				child.to_svg(context, writer)?;
			}

			Ok(())
		})
	}
}

impl<'a> Fibroblast<'a> {
	pub fn to_svg(&'a self, writer: &mut XmlWriter<impl std::io::Write>) -> ClgnDecodingResult<()> {
		self.root.to_svg(&self.context, writer)
	}
}
