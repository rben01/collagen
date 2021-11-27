use collagen::cli;

fn main() {
	let app = cli::get_cli_parser();
	let matches = app
		.get_matches_safe()
		.map_err(|err| {
			println!("{}", err.message);
			std::process::exit(1);
		})
		.unwrap(); // TODO: replace with `into_ok` when stabilized

	cli::handle_cli_matches(matches)
		.map_err(|err| {
			println!("{}", err);
			std::process::exit(err.exit_code())
		})
		.unwrap();
}
