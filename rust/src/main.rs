#[cfg(feature = "cli")]
use clap::Parser;
#[cfg(feature = "cli")]
use collagen::cli;
use std::process::ExitCode;

#[cfg(feature = "cli")]
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

#[cfg(not(feature = "cli"))]
fn main() {
	panic!("This binary requires the 'cli' feature to be enabled");
}
