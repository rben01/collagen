mod decode;
// mod decoding_error;
mod fibroblast;
use decode::decoding_error::ClgnDecodingError;

fn main() -> Result<(), ClgnDecodingError> {
	match decode::decode_folder::parse_folder_to_svg("./test/image") {
		Ok(f) => {
			std::fs::write("./test/out.svg", f)?;
		}
		Err(e) => println!("{:?}", e),
	}
	Ok(())
}
