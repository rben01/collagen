use clap::Parser;
use collagen::cli;
use std::process::ExitCode;

fn main() -> ExitCode {
	let app = cli::Cli::parse();

	match app.run() {
		Ok(_) => ExitCode::SUCCESS,
		Err(err) => {
			eprintln!("{err}");
			err.exit_code()
		}
	}
}
