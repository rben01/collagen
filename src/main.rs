mod cli;
mod fibroblast;
mod from_json;
mod to_svg;

use from_json::decoding_error::ClgnDecodingResult;

fn main() -> ClgnDecodingResult<()> {
	let app = cli::get_cli_parser();
	let matches = app.get_matches_safe().map_err(|err| {
		println!("{}", err.message);
		err
	})?;

	cli::handle_cli_matches(matches)?;

	Ok(())

	// match result {
	// 	Ok(_) => return Ok(()),
	// 	Err(clgn_err) => {
	// 		if let ClgnDecodingError::Cli(ref err) = clgn_err {
	// 			println!("{}", err.message);
	// 		}

	// 		return Err(clgn_err);
	// 	}
	// };

	// let file_writer = std::fs::OpenOptions::new()
	// 	.read(false)
	// 	.create(true)
	// 	.truncate(true)
	// 	.write(true)
	// 	.open("./test/out.svg")?;
	// let mut xml_writer = XmlWriter::new(file_writer);

	// Fibroblast::from_dir("./test/image")?.to_svg_through_writer(&mut xml_writer)
}
