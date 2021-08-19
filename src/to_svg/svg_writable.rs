use crate::fibroblast::{data_types::SimpleValue, ChildTag, ImageTag, OtherTag, RootTag, TagLike};
pub use crate::from_json::decoding_error::{ClgnDecodingError, ClgnDecodingResult};
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event as XmlEvent};
use quick_xml::Writer;
use std::borrow::Cow;
use std::io::Cursor;
use std::path::Path;

type AttrKVValueVec<'a> = Vec<(&'a str, Cow<'a, SimpleValue>)>;

fn _default_derived_attrs<T: SvgWritable + ?Sized>(tag: &T) -> ClgnDecodingResult<AttrKVValueVec> {
	Ok(tag
		.attrs()
		.iter()
		.map(|(k, v)| (k.as_ref(), Cow::Borrowed(v)))
		.collect())
}

trait SvgWritable: TagLike {
	fn derived_attrs(&self, _root_dir: &Path) -> ClgnDecodingResult<AttrKVValueVec> {
		_default_derived_attrs(self)
	}

	fn to_svg_through_writer(
		&self,
		root_dir: &Path,
		writer: &mut Writer<Cursor<Vec<u8>>>,
	) -> ClgnDecodingResult<()> {
		let tag_name = self.tag_name();
		let tag_name_bytes = tag_name.as_bytes();
		let mut curr_elem = BytesStart::borrowed_name(tag_name_bytes);

		// If only we could avoid allocating `Vec`s here. But that's the price of having
		// `SimpleValue::to_maybe_string()` return an `Option<Cow<'_, str>>`; somebody
		// has to own something somewhere. Since the Cow is borrowing, we need to own
		// here. Having `SimpleValue::to_maybe_string()` return `String` would obviate
		// the collections here -- but then we'd be doing tons of copies *there*. Better
		// to allocate a vector or two than arbitrarily many Strings, right?

		let attr_values = self.derived_attrs(root_dir)?;

		// This could also be achieved with `filter_map`, but this has clearer
		// performance guarantees. And I think `filter_map` doesn't handle references
		// optimally (in theory, we shouldn't need a second `Vec` here), so there's no
		// reason to use it
		let attr_strings = attr_values
			.iter()
			.filter_map(|(k, v)| v.to_maybe_string().map(|s| (*k, s)))
			.collect::<Vec<_>>();

		curr_elem.extend_attributes(attr_strings.iter().map(|(k, v)| (*k, v.as_ref())));
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

impl SvgWritable for ImageTag {
	fn derived_attrs(&self, root_dir: &Path) -> ClgnDecodingResult<AttrKVValueVec> {
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
		let abs_image_path = root_dir.join(&self.image_path());
		let b64_string = base64::encode(std::fs::read(abs_image_path)?);
		let src_str = format!("data:image/{};base64,{}", kind, b64_string);

		let attrs = _default_derived_attrs(self)?
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

impl SvgWritable for OtherTag {}

impl SvgWritable for ChildTag {
	fn derived_attrs(&self, root_dir: &Path) -> ClgnDecodingResult<AttrKVValueVec> {
		match self {
			Self::Image(t) => t.derived_attrs(root_dir),
			Self::Other(t) => t.derived_attrs(root_dir),
		}
	}
}

impl SvgWritable for RootTag {
	fn derived_attrs(&self, _root_dir: &Path) -> ClgnDecodingResult<AttrKVValueVec> {
		// If JSON didn't set "xmlns", we add it to the attr list with a value of
		// "http://www.w3.org/2000/svg" to get `xmlns="http://www.w3.org/2000/svg"` in
		// the output. I think you need this for SVGs to not be treated as XML by some
		// browsers?

		let mut attrs = _default_derived_attrs(self)?;

		if !self.attrs().contains_key("xmlns") {
			attrs.push((
				"xmlns",
				Cow::Owned(SimpleValue::Text("http://www.w3.org/2000/svg".to_string())),
			));
		}

		Ok(attrs)
	}
}

pub fn parse_dir_to_svg<P: AsRef<Path>>(path: P) -> ClgnDecodingResult<String> {
	let path = path.as_ref();
	RootTag::from_dir(path)?.to_svg(path)
}
