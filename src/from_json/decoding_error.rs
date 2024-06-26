//! Lots can go wrong while decoding. Let's codify that! This file provides the `enum`
//! [`ClgnDecodingError`], which wraps all the various errors that an arise during the
//! decoding process. This file also provides [`ClgnDecodingResult<T>`] which is a
//! [`Result`] whose `Err` variant wraps a `ClgnDecodingError`.
//!
//! For ergonomics, `ClgnDecodingError` gets a `From` implementation for each type one
//! of its variants wraps. This lets the `?` operator "just work" in any function
//! returning a `ClgnDecodingResult`. (Otherwise we'd have to sprinkle `.map_err`
//! everywhere.)

use crate::{fibroblast::tags::ErrorTagReason, parsing::errors::VariableEvaluationError};
use quick_xml::Error as XmlError;
use serde_json as json;
use std::{fmt::Display, io, path::PathBuf, str::Utf8Error};
use zip::result::ZipError;

pub type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

#[derive(Debug)]
pub enum ClgnDecodingError {
	InvalidSchema(ErrorTagReason),
	Parsing(Vec<VariableEvaluationError>),
	Io(io::Error, PathBuf),
	InvalidPath(PathBuf),
	Zip(ZipError),
	JsonDecode(json::Error, PathBuf),
	JsonEncode(json::Error, Option<PathBuf>),
	Xml(XmlError),
	ToSvgString(Utf8Error),
	Image {
		msg: String,
	},
	Foreach {
		msg: String,
	},
	If {
		msg: String,
	},
	InvalidField {
		msg: String,
	},
	BundledFontNotFound {
		font_name: String,
	},
	FolderWatch(Vec<notify::Error>),
	RecursiveWatch {
		in_folder: PathBuf,
		out_file: PathBuf,
	},
	ChannelRecv(std::sync::mpsc::RecvError),
}

impl ClgnDecodingError {
	#[must_use]
	pub fn exit_code(&self) -> i32 {
		use ClgnDecodingError::*;
		match self {
			InvalidSchema { .. } => 1,
			Parsing { .. } => 3,
			JsonDecode { .. } => 4,
			JsonEncode { .. } => 5,
			InvalidPath { .. } => 6,
			Io { .. } => 7,
			Image { .. } => 8,
			Xml { .. } => 15,
			ToSvgString { .. } => 19,
			BundledFontNotFound { .. } => 22,
			InvalidField { .. } => 27,
			Zip { .. } => 33,
			FolderWatch { .. } => 49,
			RecursiveWatch { .. } => 50,
			ChannelRecv { .. } => 52,
			Foreach { .. } => 77,
			If { .. } => 78,
		}
	}
}

impl Display for ClgnDecodingError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		use ClgnDecodingError::*;
		match self {
			InvalidSchema(reason) => write!(f, "{reason}"),
			Parsing(e) => write!(f, "Parsing: {e:?}"),
			Io(e, path) => write!(f, "{path:?}: {e}"),
			InvalidPath(p) => write!(f, "Invalid path: {p:?}"),
			Zip(e) => write!(f, "{e:?}"),
			JsonDecode(e, path) => write!(f, "{path:?}: {e}"),
			JsonEncode(e, path) => write!(f, "{path:?}: {e}"),
			Xml(e) => write!(f, "{e:?}"),
			FolderWatch(e) => write!(f, "{e:?}"),
			ChannelRecv(e) => write!(f, "{e:?}"),
			ToSvgString(e) => write!(f, "{e:?}; invalid UTF-8 sequence when converting to string"),
			RecursiveWatch {
				in_folder,
				out_file,
			} => write!(
				f,
				"Refusing to run in --watch mode. \
				 out_file {out_file:?} is a descendent of in_folder \
				 {in_folder:?}, which would lead to an infinite loop: \
				 every time out_file were modified, it would kick off another \
				 run of Collagen, which would modify out_file, ad infinitum. \
				 To fix this, set out_file to a location outside \
				 of {in_folder:?}.",
			),
			InvalidField { msg } | Image { msg } | Foreach { msg } | If { msg } => {
				write!(f, "{msg}")
			}
			BundledFontNotFound { font_name } => write!(
				f,
				"Requested bundled font '{font_name}' not found; make sure it \
				 was bundled when `clgn` was built."
			),
		}
	}
}

impl From<Vec<VariableEvaluationError>> for ClgnDecodingError {
	fn from(errs: Vec<VariableEvaluationError>) -> Self {
		Self::Parsing(errs)
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

impl From<notify::Error> for ClgnDecodingError {
	fn from(err: notify::Error) -> Self {
		Self::FolderWatch(vec![err])
	}
}

impl From<Vec<notify::Error>> for ClgnDecodingError {
	fn from(err: Vec<notify::Error>) -> Self {
		Self::FolderWatch(err)
	}
}

impl From<std::sync::mpsc::RecvError> for ClgnDecodingError {
	fn from(err: std::sync::mpsc::RecvError) -> Self {
		Self::ChannelRecv(err)
	}
}
