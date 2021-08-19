mod from_json;
// mod decoding_error;
mod fibroblast;
mod to_svg;

use from_json::decoding_error::ClgnDecodingError;
use to_svg::svg_writable::parse_dir_to_svg;

fn main() -> Result<(), ClgnDecodingError> {
	match parse_dir_to_svg("./test/image") {
		Ok(f) => {
			std::fs::write("./test/out.svg", f)?;
		}
		Err(e) => println!("{:?}", e),
	}
	Ok(())
}
