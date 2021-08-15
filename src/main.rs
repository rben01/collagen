mod decode;
// mod decoding_error;
mod fibroblast;
use decode::decoding_error::ClgnDecodingError;

use crate::fibroblast::Fibroblast;

fn main() -> Result<(), ClgnDecodingError> {
	// let archive = get_manifest_json_from_zip_path("./test/image.zip");
	// println!("{:?}", archive)
	println!(
		"{:?}",
		decode::decode_folder::parse_folder_to_json("./test/image")
	);

	let reader = std::fs::File::open("./test/image/collagen.json")?;
	// let f: Fibroblast = serde_json::from_reader(reader)?;
	// println!("{:?}", f.to_svg());
	Ok(())
}
