use std::{borrow::Cow, path::PathBuf, str::FromStr};

use clap::{App, Arg, ArgMatches};

use crate::{fibroblast::Fibroblast, to_svg::svg_writable::ClgnDecodingResult};
use quick_xml::Writer as XmlWriter;

pub fn get_cli_parser() -> App<'static, 'static> {
	App::new("clgn")
		.about("The Collage Generator")
		.version("0.5")
		.author("Robert Bennett <rltbennett@icloud.com>")
		.arg(
			Arg::with_name("in-file")
				.short("i")
				.required(true)
				.takes_value(true),
		)
		.arg(
			Arg::with_name("out-file")
				.short("o")
				.required(true)
				.takes_value(true),
		)
}

pub(crate) fn handle_cli_matches(matches: ArgMatches) -> ClgnDecodingResult<()> {
	let in_file = matches.value_of("in-file").unwrap(); // safe so long as in-file is required (.takes_value(true))
	let out_file = matches.value_of("out-file").unwrap();
	// let out_file = match out_file {
	// 	Some(value) => Cow::Borrowed(value),
	// 	None => PathBuf::from(in_file)
	// 		.with_extension("svg")
	// 		.to_string_lossy(),
	// };

	let file_writer = std::fs::OpenOptions::new()
		.read(false)
		.create(true)
		.truncate(true)
		.write(true)
		.open(out_file)?;
	let mut xml_writer = XmlWriter::new(file_writer);

	Fibroblast::from_dir(in_file)?.to_svg_through_writer(&mut xml_writer)?;

	Ok(())
}
