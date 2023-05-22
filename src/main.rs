use clap::Parser;
use collagen::cli;

// TODO: When Termination API is stabilized, use it

fn main() {
	let app = cli::Cli::parse();

	let result = app.run().map_err(|err| {
		eprintln!("{}", err);
		err.exit_code()
	});

	match result {
		Ok(_) => {}
		Err(exit_code) => std::process::exit(exit_code),
	}
}
