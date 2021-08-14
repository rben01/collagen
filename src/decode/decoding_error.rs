use serde_json as json;
use std::io;
use zip::result::ZipError;

#[derive(Debug)]
pub enum ClgnDecodingError {
	MissingManifest,
	UnicodeError,
	Io(io::Error),
	Zip(ZipError),
	JsonDecode(json::Error),
}

impl From<io::Error> for ClgnDecodingError {
	fn from(error: io::Error) -> Self {
		Self::Io(error)
	}
}

impl From<json::Error> for ClgnDecodingError {
	fn from(error: json::Error) -> Self {
		Self::JsonDecode(error)
	}
}

impl From<ZipError> for ClgnDecodingError {
	fn from(error: ZipError) -> Self {
		Self::Zip(error)
	}
}
