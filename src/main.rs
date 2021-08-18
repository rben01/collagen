mod decode;
// mod decoding_error;
mod fibroblast;
use decode::decoding_error::ClgnDecodingError;

fn main() -> Result<(), ClgnDecodingError> {
	match decode::decode_dir::parse_dir_to_svg("./test/image") {
		Ok(f) => {
			std::fs::write("./test/out.svg", f)?;
		}
		Err(e) => println!("{:?}", e),
	}
	Ok(())
}
