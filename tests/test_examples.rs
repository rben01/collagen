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
}

#[cfg(any(test, bench))]
mod example_1 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-02/example-01",
			"./tests/examples/svgs/example-01.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_2 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-02",
			"./tests/examples/svgs/example-02.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_3 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-03",
			"./tests/examples/svgs/example-03.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_4 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-04",
			"./tests/examples/svgs/example-04.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_5 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-05",
			"./tests/examples/svgs/example-05.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_6 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-06",
			"./tests/examples/svgs/example-06.svg",
		)
	}

	#[test]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}

#[cfg(any(test, bench))]
mod example_7 {
	use super::*;

	#[track_caller]
	fn example() {
		test_clgn_against_existing_output(
			"./tests/examples/example-07",
			"./tests/examples/svgs/example-07.svg",
		)
	}

	#[cfg(feature = "font_impact")]
	#[test]
	fn test() {
		example()
	}

	#[cfg(not(feature = "font_impact"))]
	#[test]
	#[should_panic]
	fn test() {
		example()
	}

	// #[bench]
	// fn bench(b: &mut Bencher) {
	// 	b.iter(example);
	// }
}
