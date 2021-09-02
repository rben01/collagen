use quick_xml::Error as XmlError;
use serde_json as json;
use std::io;
use std::str::Utf8Error;
use zip::result::ZipError;

pub(crate) type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

use crate::fibroblast::parse_vars::VariableSubstitutionError;

#[derive(Debug)]
pub(crate) enum ClgnDecodingError {
	Parse(VariableSubstitutionError),
	Unicode(Utf8Error),
	Io(io::Error),
	Zip(ZipError),
	JsonDecode(json::Error),
	Xml(XmlError),
	Image(String),
}

impl From<VariableSubstitutionError> for ClgnDecodingError {
	fn from(err: VariableSubstitutionError) -> Self {
		Self::Parse(err)
	}
}

impl From<Utf8Error> for ClgnDecodingError {
	fn from(err: Utf8Error) -> Self {
		Self::Unicode(err)
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
