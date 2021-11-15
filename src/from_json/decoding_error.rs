//! Lots can go wrong while decoding. Let's codify that! This file provides the `enum`
//! [`ClgnDecodingError`], which wraps all the various errors that an arise during the
//! decoding process. This file also provides [`ClgnDecodingResult<T>`] which is a
//! [`Result`] whose `Err` variant wraps a `ClgnDecodingError`.
//!
//! For ergonomics, `ClgnDecodingError` gets a `From` implementation for each type one
//! of its variants wraps. This lets the `?` operator "just work" in any function
//! returning a `ClgnDecodingResult`. (Otherwise we'd have to sprinkle `.map_err`
//! everywhere.)

use clap::Error as CliError;
use quick_xml::Error as XmlError;
use serde_json as json;
use std::io;
use std::str::Utf8Error;
use std::string::FromUtf8Error;
use zip::result::ZipError;

use crate::fibroblast::data_types::context::VariableSubstitutionError;

pub type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

#[derive(Debug)]
pub enum ClgnDecodingError {
	Parse(VariableSubstitutionError),
	Utf8(Utf8Error),
	FromUtf8(FromUtf8Error),
	Io(io::Error),
	Zip(ZipError),
	JsonDecode(json::Error),
	Xml(XmlError),
	Image(String),
	Cli(CliError),
	BuiltWithoutBundledFonts,
	BundledFontNotFound(String),
}

impl From<VariableSubstitutionError> for ClgnDecodingError {
	fn from(err: VariableSubstitutionError) -> Self {
		Self::Parse(err)
	}
}

impl From<Utf8Error> for ClgnDecodingError {
	fn from(err: Utf8Error) -> Self {
		Self::Utf8(err)
	}
}

impl From<FromUtf8Error> for ClgnDecodingError {
	fn from(err: FromUtf8Error) -> Self {
		Self::FromUtf8(err)
	}
}

impl From<io::Error> for ClgnDecodingError {
	fn from(err: io::Error) -> Self {
		Self::Io(err)
	}
}

impl From<json::Error> for ClgnDecodingError {
	fn from(err: json::Error) -> Self {
		Self::JsonDecode(err)
	}
}

impl From<ZipError> for ClgnDecodingError {
	fn from(err: ZipError) -> Self {
		Self::Zip(err)
	}
}

impl From<XmlError> for ClgnDecodingError {
	fn from(err: XmlError) -> Self {
		Self::Xml(err)
	}
}

impl From<CliError> for ClgnDecodingError {
	fn from(err: CliError) -> Self {
		Self::Cli(err)
	}
}
