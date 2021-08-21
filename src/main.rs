mod fibroblast;
mod from_json;
mod to_svg;

use from_json::decoding_error::ClgnDecodingError;
use quick_xml::Writer as XmlWriter;
use to_svg::svg_writable::folder_to_svg_through_writer;

fn main() -> Result<(), ClgnDecodingError> {
	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open("./test/out.svg")?;
	let mut xml_writer = XmlWriter::new(file_writer);

	folder_to_svg_through_writer("./test/image", &mut xml_writer)

	// let mut xml_writer = XmlWriter::new(Cursor::new(Vec::new()));
	// match folder_to_svg_through_writer("./test/image", &mut xml_writer) {
	// 	Ok(_) => {
	// 		let buf = xml_writer.into_inner().into_inner();
	// 		let out_string = std::str::from_utf8(&buf)?.to_owned();
	// 		std::fs::write("./test/out.svg", out_string)?;
	// 	}
	// 	Err(e) => println!("{:?}", e),
	// }
	// Ok(())
}
