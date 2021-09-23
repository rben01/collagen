mod cli;
mod fibroblast;
mod from_json;
mod to_svg;

use from_json::decoding_error::ClgnDecodingError;

fn main() -> Result<(), ClgnDecodingError> {
	let app = cli::get_cli_parser();
	cli::handle_cli_matches(app.get_matches_safe()?)

	// let file_writer = std::fs::OpenOptions::new()
	// 	.read(false)
	// 	.create(true)
	// 	.truncate(true)
	// 	.write(true)
	// 	.open("./test/out.svg")?;
	// let mut xml_writer = XmlWriter::new(file_writer);

	// Fibroblast::from_dir("./test/image")?.to_svg_through_writer(&mut xml_writer)
}
