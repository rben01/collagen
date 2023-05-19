//! The command line interface for this app

use std::path::PathBuf;

use clap::{App, Arg, ArgMatches};

use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult, Fibroblast};
use quick_xml::Writer as XmlWriter;

pub fn get_cli_parser() -> App<'static, 'static> {
	App::new("clgn")
		.about("Collagen: The Collage Generator")
		.arg(
			Arg::with_name("skeleton")
				.alias("in-folder")
				.short("i")
				.required(true)
				.takes_value(true)
				.help("The path to the input skeleton folder"),
		)
		.arg(
			Arg::with_name("out-file")
				.short("o")
				.required(true)
				.takes_value(true)
				.help("The path to save the resulting SVG to"),
		)
}

pub fn handle_cli_matches(matches: ArgMatches) -> ClgnDecodingResult<()> {
	let in_file = matches.value_of("skeleton").unwrap(); // safe so long as in-file is required (.takes_value(true))
	let out_file = matches.value_of("out-file").unwrap();

	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open(out_file)
		// TODO: replace `unwrap` with `into_ok` when stabilized
		.map_err(|e| ClgnDecodingError::Io(e, in_file.parse::<PathBuf>().unwrap()))?;
	let mut xml_writer = XmlWriter::new(file_writer);

	let f = Fibroblast::from_dir(in_file.into())?;
	println!("{f:?}");
	f.to_svg(&mut xml_writer)?;

	Ok(())
}
