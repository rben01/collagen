use collagen::Fibroblast;
use quick_xml::Writer as XmlWriter;
use std::fs::read;
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

	let out_bytes = read(out_path).unwrap();

	if fibroblast_bytes != out_bytes {
		panic!("Collagen generated from input did not match expected output. Input path: {:?}. Output path: {:?}.", clgn_path, out_path);
	}
	// assert_eq!(fibroblast_bytes, out_bytes)
}

#[test]
fn example_clgn_1() {
	test_clgn_against_existing_output(
		"./tests/examples/example-02/example-01",
		"./tests/examples/svgs/example-01.svg",
	)
}

#[test]
fn example_clgn_2() {
	test_clgn_against_existing_output(
		"./tests/examples/example-02",
		"./tests/examples/svgs/example-02.svg",
	)
}

#[test]
fn example_clgn_3() {
	test_clgn_against_existing_output(
		"./tests/examples/example-03",
		"./tests/examples/svgs/example-03.svg",
	)
}

#[test]
fn example_clgn_4() {
	test_clgn_against_existing_output(
		"./tests/examples/example-04",
		"./tests/examples/svgs/example-04.svg",
	)
}
