//! For writing the in-memory representation to SVG. At some point I would like to
//! implement https://serde.rs/transcode.html, using `serde` to stream straight from
//! JSON to SVG (XML). I don't think it should be *that* hard.

use crate::fibroblast::{context::DecodingContext, ChildTag, RootTag, TagLike};
pub(crate) use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent};
use quick_xml::Writer as XmlWriter;
use std::cell::RefCell;
use std::collections::VecDeque;
use std::fmt::Debug;
use std::io::Cursor;
use std::path::Path;

pub(crate) trait SvgWritable: TagLike {
	// /// Putting a default here is not recommended because the nesting of enum variants
	// /// means a parent enum might inadvertently `derived_attrs`. It is a shame that all
	// /// adopting types must implement the obvious default so that no type may forget to
	// /// override it
	// fn derived_attrs<'a>(
	// 	&'a self,
	// 	context: &'a DecodingContext,
	// ) -> ClgnDecodingResult<AttrKVValueVec<'a>>;

	// fn derived_children<'a>(
	// 	&'a self,
	// 	context: &'a DecodingContext,
	// ) -> ClgnDecodingResult<&'a [ChildTag]>;

	// fn derived_text(&self, context: &DecodingContext) -> ClgnDecodingResult<String> {
	// 	let result = _replace_vars_with_values(self.text(), context)?;
	// 	Ok(result)
	// }

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
		// println!("{:?}: {:?}", tag_name, self.attrs(context));

		// If only we could avoid allocating `Vec`s here. But that's the price of having
		// `SimpleValue::to_maybe_string()` return an `Option<Cow<'_, str>>`; somebody
		// has to own something somewhere. Since the Cow is borrowing, we need to own
		// here. Having `SimpleValue::to_maybe_string()` return `String` would obviate
		// the collections here -- but then we'd be doing tons of copies *there*. Better
		// to allocate a vector or two than arbitrarily many Strings, right?

		let my_vars = self.vars(context);
		// We undo the push_front by pop_front'ing below (is there a better way to do
		// this kind of deferral?)
		if let Some(vars) = my_vars {
			context.vars_stack.borrow_mut().push_front(vars);
		}
		let attr_values = self.attrs(context)?;

		let attr_strings = attr_values
			.iter()
			.filter_map(|(k, v)| v.to_maybe_string().map(|s| (*k, s)))
			.collect::<Vec<_>>();

		curr_elem.extend_attributes(attr_strings.iter().map(|(k, v)| (*k, v.as_ref())));
		writer.write_event(XmlEvent::Start(curr_elem))?;

		for child in self.children(context)? {
			child.to_svg_through_writer(context, writer)?;
		}

		if my_vars.is_some() {
			context.vars_stack.borrow_mut().pop_front();
		}

		writer.write_event(XmlEvent::Text(BytesText::from_plain_str(
			&self.text(context)?,
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

impl SvgWritable for ChildTag {}

impl SvgWritable for RootTag {}

/// Note that `writer` may write greedily. If reading a file errors before it finishes,
/// you may end up overwriteinga good file with the head of a bad file.
pub(crate) fn folder_to_svg_through_writer_with_context<
	'a,
	P: AsRef<Path> + 'a,
	W: std::io::Write,
>(
	path: P,
	mut writer: &mut XmlWriter<W>,
	context: &'a DecodingContext<'a>,
) -> ClgnDecodingResult<()> {
	let path = path.as_ref();

	let rt = RootTag::from_dir(path)?;

	rt.to_svg_through_writer(&context, &mut writer)
}

pub(crate) fn folder_to_svg_through_writer<P: AsRef<Path>, W: std::io::Write>(
	path: P,
	mut writer: &mut XmlWriter<W>,
) -> ClgnDecodingResult<()> {
	let path = path.as_ref();

	let context = DecodingContext::new_at_root(path);

	folder_to_svg_through_writer_with_context(path, writer, &context)
}
