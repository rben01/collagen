mod decode;
// mod decoding_error;
mod fibroblast;
use decode::decoding_error::ClgnDecodingError;

fn main() -> Result<(), ClgnDecodingError> {
	let svg_str = decode::decode_folder::parse_folder_to_svg("./test/image");
	match svg_str {
		Ok(s) => println!("{}", s),
		Err(e) => println!("{:?}", e),
	}
	Ok(())
}
