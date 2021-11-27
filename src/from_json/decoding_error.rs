//! Lots can go wrong while decoding. Let's codify that! This file provides the `enum`
//! [`ClgnDecodingError`], which wraps all the various errors that an arise during the
//! decoding process. This file also provides [`ClgnDecodingResult<T>`] which is a
//! [`Result`] whose `Err` variant wraps a `ClgnDecodingError`.
//!
//! For ergonomics, `ClgnDecodingError` gets a `From` implementation for each type one
//! of its variants wraps. This lets the `?` operator "just work" in any function
//! returning a `ClgnDecodingResult`. (Otherwise we'd have to sprinkle `.map_err`
//! everywhere.)

use quick_xml::Error as XmlError;
use serde_json as json;
use std::io;
use std::path::PathBuf;
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
	Io(io::Error, PathBuf),
	Zip(ZipError),
	JsonDecode(json::Error, PathBuf),
	Xml(XmlError),
	Image(String),
	BundledFontNotFound(String),
}

impl ClgnDecodingError {
	pub fn exit_code(&self) -> i32 {
		use ClgnDecodingError::*;
		match self {
			Parse(..) => 3,
			JsonDecode(..) => 4,
			Xml(..) => 5,
			Io(..) => 7,
			Image(..) => 8,
			Utf8(..) => 11,
			FromUtf8(..) => 12,
			BundledFontNotFound(..) => 22,
			Zip(..) => 33,
		}
	}
}

impl std::fmt::Display for ClgnDecodingError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use ClgnDecodingError::*;
		let s = match self {
			Parse(e) => format!("{:?}", e),
			Utf8(e) => format!("{:?}", e),
			FromUtf8(e) => format!("{:?}", e),
			Io(e, path) => format!("{}: {:?}", e, path),
			Zip(e) => format!("{:?}", e),
			JsonDecode(e, path) => format!("{}: {:?}", e, path),
			Xml(e) => format!("{:?}", e),
			Image(e) => e.to_owned(),
			BundledFontNotFound(s) => format!(
				"Requested bundled font '{}' not found; make sure it was bundled when `clgn` was built.",
				s
			),
		};

		f.write_str(s.as_str())
	}
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
