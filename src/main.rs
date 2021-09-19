mod fibroblast;
mod from_json;
mod to_svg;

use fibroblast::Fibroblast;
use from_json::decoding_error::ClgnDecodingError;
use quick_xml::Writer as XmlWriter;

fn main() -> Result<(), ClgnDecodingError> {
	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open("./test/out.svg")?;
	let mut xml_writer = XmlWriter::new(file_writer);

	Fibroblast::from_dir("./test/image")?.to_svg_through_writer(&mut xml_writer)
}
