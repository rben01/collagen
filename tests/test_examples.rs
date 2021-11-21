use collagen::Fibroblast;
use quick_xml::Writer as XmlWriter;
use std::path::Path;

#[track_caller]
fn test_clgn_against_existing_output<P1: AsRef<Path>, P2: AsRef<Path>>(
	clgn_path: P1,
	out_path: P2,
) {
	let clgn_path = clgn_path.as_ref();
	let out_path = out_path.as_ref();

	let mut fibroblast_bytes = Vec::<u8>::new();
	let mut xml_writer = XmlWriter::new(&mut fibroblast_bytes);

	let fibroblast = Fibroblast::from_dir(clgn_path).unwrap();
	fibroblast.to_svg_through_writer(&mut xml_writer).unwrap();

	let out_bytes = std::fs::read(out_path).unwrap();

	if fibroblast_bytes != out_bytes {
		panic!("Collagen generated from input did not match expected output. Input path: {:?}. Output path: {:?}.", clgn_path, out_path);
	}
}

macro_rules! test_input_output {
	($name:ident, $input_path:expr => $output_path:expr $(,)?) => {
		mod $name {
			use super::*;

			#[track_caller]
			fn _test_it() {
				test_clgn_against_existing_output($input_path, $output_path)
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
		$input_path:expr => $output_path:expr,
		pass_if: $attr_to_pass:meta,
		fail_if: $attr_to_fail:meta $(,)?
	) => {
		mod $name {
			use super::*;

			#[track_caller]
			fn _test_it() {
				test_clgn_against_existing_output($input_path, $output_path)
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

test_input_output!(
	example_01, "./tests/examples/example-02/example-01" => "./tests/examples/svgs/example-01.svg"
);

test_input_output!(
	example_02, "./tests/examples/example-02" => "./tests/examples/svgs/example-02.svg"
);

test_input_output!(
	example_03, "./tests/examples/example-03" => "./tests/examples/svgs/example-03.svg"
);

test_input_output!(
	example_04, "./tests/examples/example-04" => "./tests/examples/svgs/example-04.svg"
);

test_input_output!(
	example_05, "./tests/examples/example-05" => "./tests/examples/svgs/example-05.svg"
);

test_input_output!(
	example_06, "./tests/examples/example-06" => "./tests/examples/svgs/example-06.svg"
);

test_input_output!(
	example_07,
	"./tests/examples/example-07" => "./tests/examples/svgs/example-07.svg",
	pass_if: cfg(feature="font_impact"),
	fail_if: cfg(not(feature="font_impact"))
);
