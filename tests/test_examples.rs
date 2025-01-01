use collagen::Fibroblast;
use quick_xml::Writer as XmlWriter;
use std::path::{Path, PathBuf};

#[track_caller]
fn test_clgn_against_existing_output(clgn_path: impl AsRef<Path>, out_path: impl AsRef<Path>) {
	let clgn_path = clgn_path.as_ref();
	let out_path = out_path.as_ref();

	let mut fibroblast_bytes = Vec::<u8>::new();
	let mut xml_writer = XmlWriter::new(&mut fibroblast_bytes);

	let fibroblast = Fibroblast::from_dir(clgn_path).unwrap();
	fibroblast.to_svg(&mut xml_writer).unwrap();

	let out_bytes = std::fs::read(out_path).unwrap();

	assert!(
		// not assert_eq because on failure, the debug representations are long and useless
		fibroblast_bytes == out_bytes,
		"Collagen generated from input did not match expected output. Input path: {:?}. Output path: {:?}.",
		clgn_path,
		out_path
	);
}

macro_rules! test_input_output {
	($name:ident, $test_folder:expr $(,)?) => {
		test_input_output!($name, $test_folder, "skeleton" => "out.svg");
	};
	($name:ident, $test_folder:expr, pass_if: $attr_to_pass:meta, fail_if: $attr_to_fail:meta $(,)?) => {
		test_input_output!(
			$name,
			$test_folder,
			"skeleton" => "out.svg",
			pass_if: $attr_to_pass,
			fail_if: $attr_to_fail,
		);
	};
	($name:ident, $test_folder:expr, $skeleton_rel_path:expr => $out_path:expr $(,)?) => {
		mod $name {
			use super::*;

			#[track_caller]
			fn _test_it() {
				test_clgn_against_existing_output(
					PathBuf::from($test_folder).join($skeleton_rel_path),
					PathBuf::from($test_folder).join($out_path)
				);
			}

			#[test]
			fn test() {
				_test_it()
			}

			// #[bench]
			// fn bench(b: &mut Bencher) {
			// 	b.iter(_test_it);
			// }
		}
	};
	(
		$name:ident,
		$test_folder:expr,
		$skeleton_rel_path:expr => $out_path:expr,
		pass_if: $attr_to_pass:meta,
		fail_if: $attr_to_fail:meta $(,)?
	) => {
		mod $name {
			use super::*;

			#[track_caller]
			fn _test_it() {
				test_clgn_against_existing_output(
					PathBuf::from($test_folder).join($skeleton_rel_path),
					PathBuf::from($test_folder).join($out_path)
				);
			}

			#[$attr_to_pass]
			#[test]
			fn test() {
				_test_it()
			}

			#[$attr_to_fail]
			#[should_panic]
			#[test]
			fn test() {
				_test_it()
			}

			// #[bench]
			// fn bench(b: &mut Bencher) {
			// 	b.iter(_test_it);
			// }
		}
	};
}

#[cfg(test)]
mod examples {
	use super::*;

	test_input_output!(empty, "./tests/examples/empty");
	test_input_output!(basic_smiley, "./tests/examples/basic-smiley-pure-svg");
	test_input_output!(
		smiley_with_speech_bubble,
		"./tests/examples/kitty-nesting-smiley/skeleton/smiley"
	);
	test_input_output!(
		kitty_with_nested_smiley,
		"./tests/examples/kitty-nesting-smiley"
	);
	test_input_output!(hodgepodge, "./tests/examples/random-gibberish");
	test_input_output!(
		simple_nesting, "./tests/examples/simple-nesting", "A" => "out.svg"
	);

	test_input_output!(
		drake_user_specified_font,
		"./tests/examples/drake-user-specified-font"
	);
	test_input_output!(
		drake_bundled_font,
		"./tests/examples/drake-bundled-font",
		pass_if: cfg(feature ="font_impact"),
		fail_if: cfg(not(feature = "font_impact"))
	);
	test_input_output!(
		drake_manually_specified_font,
		"./tests/examples/drake-manually-specified-font"
	);
	test_input_output!(drake_no_font, "./tests/examples/drake-no-font");
}
