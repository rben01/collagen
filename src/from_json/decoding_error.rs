//! Lots can go wrong while decoding. Let's codify that! This file provides the `enum`
//! [`ClgnDecodingError`], which wraps all the various errors that an arise during the
//! decoding process. This file also provides [`ClgnDecodingResult<T>`] which is a
//! [`Result`] whose `Err` variant wraps a `ClgnDecodingError`.
//!
//! For ergonomics, `ClgnDecodingError` gets a `From` implementation for each type one
//! of its variants wraps. This lets the `?` operator "just work" in any function
//! returning a `ClgnDecodingResult`. (Otherwise we'd have to sprinkle `.map_err`
//! everywhere.)

use crate::fibroblast::tags::ErrorTagReason;
use quick_xml::Error as XmlError;
use std::{io, path::PathBuf, process::ExitCode, str::Utf8Error};
use thiserror::Error;
use zip::result::ZipError;

pub type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

#[derive(Debug, Error)]
pub enum ClgnDecodingError {
	#[error("Invalid schema: {}", .0)]
	InvalidSchema(#[from] ErrorTagReason),

	#[error("IO error reading from {path:?} ({source})")]
	IoRead { source: io::Error, path: PathBuf },

	#[error("IO error writing to {path:?} ({source})")]
	IoWrite { source: io::Error, path: PathBuf },

	#[error("IO error (neither reading nor writing) handling {path:?} ({source})")]
	IoOther { source: io::Error, path: PathBuf },

	#[error("paths may not begin with a '/'; got {:?}", .0)]
	InvalidPath(PathBuf),

	#[error("error reading {path:?} ({source})")]
	Zip { source: ZipError, path: PathBuf },

	#[error("error reading {path:?} as jsonnet ({msg})")]
	JsonnetRead { msg: String, path: PathBuf },

	#[error("error reading {path:?} as json ({source})")]
	JsonDecode {
		source: serde_json::Error,
		path: PathBuf,
	},

	#[error("error writing {path:?} as json ({source})")]
	JsonEncode {
		source: serde_json::Error,
		path: Option<PathBuf>,
	},

	#[error("XML error: {}", .0)]
	Xml(#[from] XmlError),

	#[error("error encoding XML as UTF-8: {}", .0)]
	ToSvgString(#[from] Utf8Error),

	#[error("error reading image: {msg}")]
	Image { msg: String },

	#[error("could not find bundled font {font_name:?}")]
	BundledFontNotFound { font_name: String },

	#[error("error watching folder: {:?}", .0)]
	FolderWatch(Vec<notify::Error>),

	#[error(
		"Refusing to run in --watch mode. \
		 out_file {out_file:?} is a descendent of in_folder \
		 {in_folder:?}, which would lead to an infinite loop. \
		 To fix this, set out_file to a location outside \
		 of {in_folder:?}."
	)]
	RecursiveWatch {
		in_folder: PathBuf,
		out_file: PathBuf,
	},
}

impl ClgnDecodingError {
	#[must_use]
	pub fn exit_code(&self) -> ExitCode {
		use ClgnDecodingError::*;
		ExitCode::from(match self {
			InvalidSchema { .. } => 1,
			JsonnetRead { .. } => 2,
			JsonDecode { .. } => 4,
			JsonEncode { .. } => 5,
			InvalidPath { .. } => 6,
			IoRead { .. } => 7,
			IoWrite { .. } => 8,
			IoOther { .. } => 9,
			Image { .. } => 14,
			Xml { .. } => 15,
			ToSvgString { .. } => 19,
			BundledFontNotFound { .. } => 22,
			Zip { .. } => 33,
			FolderWatch { .. } => 49,
			RecursiveWatch { .. } => 50,
		})
	}
}

impl From<notify::Error> for ClgnDecodingError {
	fn from(value: notify::Error) -> Self {
		Self::FolderWatch(vec![value])
	}
}

impl From<Vec<notify::Error>> for ClgnDecodingError {
	fn from(value: Vec<notify::Error>) -> Self {
		Self::FolderWatch(value)
	}
}
