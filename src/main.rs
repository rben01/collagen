use collagen::cli;
use collagen::ClgnDecodingResult;

fn main() -> ClgnDecodingResult<()> {
	let app = cli::get_cli_parser();
	let matches = app.get_matches_safe().map_err(|err| {
		println!("{}", err.message);
		err
	})?;

	cli::handle_cli_matches(matches)?;

	Ok(())
}
