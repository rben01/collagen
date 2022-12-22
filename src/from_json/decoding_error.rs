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
use std::fmt::Display;
use std::io;
use std::path::PathBuf;
use std::str::Utf8Error;
use zip::result::ZipError;

use crate::fibroblast::data_types::context::VariableSubstitutionError;

pub type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

#[derive(Debug)]
pub enum ClgnDecodingError {
	Parse(Vec<VariableSubstitutionError>),
	Io(io::Error, PathBuf),
	InvalidPath(PathBuf),
	Zip(ZipError),
	JsonDecode(json::Error, PathBuf),
	Xml(XmlError),
	ToSvgString(Utf8Error),
	Image { msg: String },
	BundledFontNotFound { font_name: String },
}

impl ClgnDecodingError {
	pub fn exit_code(&self) -> i32 {
		use ClgnDecodingError::*;
		match self {
			Parse(..) => 3,
			JsonDecode(..) => 4,
			Xml(..) => 5,
			InvalidPath(..) => 6,
			Io(..) => 7,
			Image { .. } => 8,
			ToSvgString(..) => 19,
			BundledFontNotFound { .. } => 22,
			Zip(..) => 33,
		}
	}
}

impl Display for ClgnDecodingError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use ClgnDecodingError::*;
		match self {
			Parse(e) => write!(f, "{:?}", e),
			Io(e, path) => write!(f, "{:?}: {}", path, e),
			InvalidPath(p) => write!(f, "Invalid path: {:?}", p),
			Zip(e) => write!(f, "{:?}", e),
			JsonDecode(e, path) => write!(f, "{:?}: {}", path, e),
			Xml(e) => write!(f, "{:?}", e),
			ToSvgString(e) => write!(
				f,
				"{:?}; invalid UTF-8 sequence when converting to string",
				e
			),
			Image { msg } => write!(f, "{}", msg),
			BundledFontNotFound { font_name } => write!(
				f,
				"Requested bundled font '{}' not found; make sure it was bundled when `clgn` was built.",
				font_name
			),
		}
	}
}

impl From<Vec<VariableSubstitutionError>> for ClgnDecodingError {
	fn from(err: Vec<VariableSubstitutionError>) -> Self {
		Self::Parse(err)
	}
}

impl From<Utf8Error> for ClgnDecodingError {
	fn from(err: Utf8Error) -> Self {
		Self::ToSvgString(err)
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
