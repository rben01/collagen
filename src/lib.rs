// See https://github.com/rust-lang/rust/issues/75075
#![doc = include_str!("../docs/readme-docsrs.md")]
#![warn(clippy::pedantic)]
#![allow(clippy::enum_glob_use)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::redundant_closure_for_method_calls)]

pub mod assets;
pub mod cli;
pub mod fibroblast;
pub mod from_json;
pub mod to_svg;
pub(crate) mod utils;

pub use fibroblast::Fibroblast;
pub use from_json::ClgnDecodingResult;
pub(crate) use quick_xml::events::Event as XmlEvent;
