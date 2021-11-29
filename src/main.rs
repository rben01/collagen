use collagen::cli;

// TODO: When Termination API is stabilized, use it

fn main() {
	let app = cli::get_cli_parser();

	let matches = app.get_matches_safe().map_err(|err| {
		eprintln!("{}", err.message);
		1
	});

	let matches = match matches {
		Ok(m) => m,
		Err(exit_code) => std::process::exit(exit_code),
	};

	let result = cli::handle_cli_matches(matches).map_err(|err| {
		eprintln!("{}", err);
		err.exit_code()
	});

	match result {
		Ok(_) => {}
		Err(exit_code) => std::process::exit(exit_code),
	}
}
