// See https://github.com/rust-lang/rust/issues/75075
#![doc = include_str!(concat!("..", PATH_SEP!(), "readme.md"))]

#[cfg(windows)]
macro_rules! PATH_SEP {
	() => {
		'\\'
	};
}

#[cfg(not(windows))]
macro_rules! PATH_SEP {
	() => {
		'/'
	};
}

pub mod cli;
pub mod fibroblast;
pub mod from_json;
pub mod to_svg;
pub(crate) mod utils;

pub use fibroblast::Fibroblast;
pub use from_json::ClgnDecodingResult;

pub mod assets;
