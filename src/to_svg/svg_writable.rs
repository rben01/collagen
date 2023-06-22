//! For writing the in-memory representation to SVG.

use crate::fibroblast::{
	data_types::DecodingContext,
	tags::{
		element::{AsSvgElement, Node, NodeGenerator, SvgElement, TextNode},
		root_tag::RootTag,
		AnyChildTag,
	},
	Fibroblast,
};
pub(crate) use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};
use quick_xml::{
	events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent},
	Writer as XmlWriter,
};
use std::io::Cursor;

pub(crate) trait SvgWritable<'a, 'b> {
	/// Convert the in-memory representation of a Fibroblast to SVG. `writer` determines
	/// where the output goes -- a `String`, to a file, etc.
	fn to_svg(
		&'b self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()>;

	fn to_svg_string(&'b self, context: &DecodingContext<'a>) -> ClgnDecodingResult<String> {
		let mut writer = XmlWriter::new(Cursor::new(Vec::new()));
		self.to_svg(context, &mut writer)?;

		let buf = writer.into_inner().into_inner();
		let out_string = std::str::from_utf8(&buf)?.to_owned();

		Ok(out_string)
	}
}

impl<'a, 'b> SvgWritable<'a, 'b> for SvgElement<'a, 'b> {
	fn to_svg(
		&'b self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		let Self {
			name,
			attrs,
			children,
		} = self;
		let name = *name;

		// Open the tag (write e.g., `<rect`)
		let mut curr_elem = BytesStart::new(name);

		// Write e.g., `attr1="val1"`
		for (k, v) in &attrs.0 {
			if let Some(v) = v.to_maybe_string() {
				curr_elem.push_attribute((*k, v.as_ref()));
			}
		}

		// Finish tag, writing `>`
		writer.write_event(XmlEvent::Start(curr_elem))?;

		// Write the children
		for child in children.as_ref() {
			child.to_svg(context, writer)?;
		}

		// Close the tag (`</rect>`)
		writer.write_event(XmlEvent::End(BytesEnd::new(name)))?;

		Ok(())
	}
}

impl<'a, 'b> SvgWritable<'a, 'b> for NodeGenerator<'a, 'b> {
	fn to_svg(
		&'b self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		let Self { children } = self;
		for child in children.as_ref() {
			child.to_svg(context, writer)?;
		}
		Ok(())
	}
}

impl<'a, 'b> SvgWritable<'a, 'b> for TextNode<'a, 'b> {
	fn to_svg(
		&self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		let Self {
			text,
			is_preescaped,
			..
		} = self;
		let text = context.eval_exprs_in_str(text.as_ref())?;
		writer.write_event(XmlEvent::Text(if *is_preescaped {
			BytesText::from_escaped(text)
		} else {
			BytesText::new(text.as_ref())
		}))?;
		Ok(())
	}
}

impl<'a, 'b> SvgWritable<'a, 'b> for AnyChildTag<'a> {
	fn to_svg(
		&'b self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		if let AnyChildTag::Container(container) = self {
			let fb = container.as_fibroblast(context)?;
			return context.with_new_root(fb.context.get_root().clone(), || {
				let children = container.children(context)?;
				for child in &*children {
					child.to_svg(context, writer)?;
				}
				Ok(())
			});
		}

		let vars = self.vars(context)?;
		let node = self.as_node(context)?;

		context.with_new_vars(vars, || match node {
			Node::Element(e) => e.to_svg(context, writer),
			Node::Generator(g) => g.to_svg(context, writer),
			Node::Text(t) => t.to_svg(context, writer),
		})?;

		Ok(())
	}
}

impl<'a, 'b> SvgWritable<'a, 'b> for RootTag<'a> {
	fn to_svg(
		&'b self,
		context: &DecodingContext<'a>,
		writer: &mut XmlWriter<impl std::io::Write>,
	) -> ClgnDecodingResult<()> {
		let elem = self.as_svg_elem(context)?;
		elem.to_svg(context, writer)
	}
}

impl<'a> Fibroblast<'a> {
	pub fn to_svg(&'a self, writer: &mut XmlWriter<impl std::io::Write>) -> ClgnDecodingResult<()> {
		self.root.to_svg(&self.context, writer)
	}
}
