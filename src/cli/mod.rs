//! The command line interface for this app

use std::path::PathBuf;

use clap::Parser;

use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult, Fibroblast};
use quick_xml::Writer as XmlWriter;

#[derive(Parser)]
#[command(name = "clgn", about = "Collagen: The Collage Generator")]
pub struct Cli {
	/// The path to the input skeleton folder
	#[arg(short = 'i', long = "in-folder")]
	in_file: String,

	/// The path to save the resulting SVG to
	#[arg(short = 'o', long = "out-file")]
	out_file: String,
}

impl Cli {
	pub fn run(self) -> ClgnDecodingResult<()> {
		let Self { in_file, out_file } = self;

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
		f.to_svg(&mut xml_writer)?;

		Ok(())
	}
}
