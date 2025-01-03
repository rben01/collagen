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
use std::{fmt, io, path::PathBuf, process::ExitCode, str::Utf8Error};
use strum::IntoEnumIterator;
use thiserror::Error;
use zip::result::ZipError;

use crate::fibroblast::tags::{any_child_tag::AnyChildTagDiscriminants, Extras};

pub type ClgnDecodingResult<T> = Result<T, ClgnDecodingError>;

#[derive(Debug, Error)]
pub enum ClgnDecodingError {
	#[error("missing manifest file; must provide either collagen.jsonnet or collagen.json")]
	MissingManifest,

	#[error("invalid schema: for {}", .0)]
	InvalidSchema(#[from] InvalidSchemaError),

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

	#[error("DEBUG: missing jsonnet file. this is not supposed to appear to end users; please file a bug!")]
	MissingJsonnetFile,

	#[error("error reading {path:?} as jsonnet ({msg})")]
	JsonnetRead { msg: String, path: PathBuf },

	#[error("failed to convert json at {path:?} to a tag ({source})")]
	JsonDecodeFile {
		source: serde_json::Error,
		path: PathBuf,
	},

	#[error(
		"after expanding jsonnet at {path:?} to json, failed to convert json to a tag ({source})"
	)]
	JsonDecodeJsonnet {
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
			JsonnetRead { .. } => 3,
			JsonDecodeFile { .. } => 4,
			JsonDecodeJsonnet { .. } => 5,
			JsonEncode { .. } => 6,
			MissingManifest => 9,
			InvalidPath { .. } => 10,
			IoRead { .. } => 11,
			IoWrite { .. } => 12,
			IoOther { .. } => 13,
			Image { .. } => 20,
			Xml { .. } => 30,
			ToSvgString { .. } => 40,
			BundledFontNotFound { .. } => 50,
			Zip { .. } => 101,
			FolderWatch { .. } => 102,
			RecursiveWatch { .. } => 103,
			MissingJsonnetFile => {
				eprintln!("DEBUG: we should not have gotten here. please file a bug!");
				199
			}
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

#[derive(Debug)]
pub enum InvalidSchemaError {
	/// A non-object type was passed where an object was expected
	///
	/// While this technically can store a `serde_json::Value::Object`, it never will
	InvalidType(serde_json::Value),
	/// Got some keys we weren't expecting
	UnexpectedKeys {
		tag_name: &'static str,
		keys: Vec<String>,
	},
	/// An object not matching any known schema was passed
	InvalidObject(Extras),
}

impl InvalidSchemaError {
	pub(crate) fn unexpected_keys(tag_name: &'static str, keys: Vec<String>) -> Self {
		Self::UnexpectedKeys { tag_name, keys }
	}
}

impl std::error::Error for InvalidSchemaError {}

impl AnyChildTagDiscriminants {
	pub(crate) fn primary_key(self) -> &'static str {
		use AnyChildTagDiscriminants::*;
		match self {
			Generic => "tag",
			Image => "image_path",
			Container => "clgn_path",
			NestedSvg => "svg_path",
			Font => "fonts",
			Text => "text",
		}
	}

	pub(crate) fn name(self) -> &'static str {
		self.into()
	}

	fn article(self) -> &'static str {
		use AnyChildTagDiscriminants::*;
		match self {
			Generic | Container | NestedSvg | Font | Text => "a",
			Image => "an",
		}
	}

	fn additional_required_keys(self) -> &'static [&'static str] {
		use AnyChildTagDiscriminants::*;
		match self {
			Generic | Image | Container | NestedSvg | Font | Text => &[],
		}
	}

	fn optional_keys(self) -> &'static [&'static str] {
		use AnyChildTagDiscriminants::*;
		match self {
			Generic => &["vars", "attrs", "children"],
			Image => &["vars", "attrs", "kind", "children"],
			Text => &["vars", "is_preescaped"],
			Container | NestedSvg | Font => &[],
		}
	}
}

impl fmt::Display for InvalidSchemaError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			InvalidSchemaError::InvalidType(v) => {
				write!(f, "Each tag must be an object; got: {v:?}")
			}
			InvalidSchemaError::UnexpectedKeys { tag_name, keys } => {
				write!(f, "unexpected keys for tag {tag_name:?}: {keys:?}")
			}
			InvalidSchemaError::InvalidObject(o) => {
				writeln!(
					f,
					"The following object did not match any known schema: {}",
					serde_json::to_string(&o).unwrap()
				)?;

				let known_tags_ids_seen = AnyChildTagDiscriminants::iter()
					.filter(|k| o.map().contains_key(k.primary_key()))
					.collect::<Vec<_>>();

				if known_tags_ids_seen.len() == 1 {
					let kt = known_tags_ids_seen[0];
					let key = kt.primary_key();
					let name = kt.name();
					let required_keys = kt.additional_required_keys();
					let optional_keys = kt.optional_keys();
					let a = kt.article();

					write!(
						f,
						"The presence of key {key:?} implies that this is {a} `{name}` tag. "
					)?;

					let unexpected_keys = o
						.map()
						.keys()
						.filter(|k| {
							let k = k.as_str();
							!(k == key || required_keys.contains(&k) || optional_keys.contains(&k))
						})
						.collect::<Vec<_>>();

					let missing_keys = required_keys
						.iter()
						.copied()
						.filter(|&k| !o.map().contains_key(k))
						.collect::<Vec<_>>();
					if unexpected_keys.is_empty() && missing_keys.is_empty() {
						write!(
							f,
							"Since you provided all of the other required keys, \
							 {required_keys:?}, check that the values were all of \
							 the right type. "
						)?;
					} else {
						if missing_keys.is_empty() {
							write!(f, "`{name}` has no other required keys. ")?;
						} else {
							write!(
								f,
								"In addition to {key:?}, keys {required_keys:?} \
								 are required, but keys {missing_keys:?} were missing. "
							)?;
						}

						if !unexpected_keys.is_empty() {
							write!(
								f,
								"The only other permitted keys for `{name}` are {optional_keys:?}, \
								 but keys {unexpected_keys:?} were passed. "
							)?;
						}
					}
				} else if known_tags_ids_seen.len() >= 2 {
					write!(
						f,
						"Could not infer the tag's type because multiple matching \
						 primary keys were found: {:?}. At most one \
						 may be provided. ",
						known_tags_ids_seen
							.iter()
							.map(|kt| kt.primary_key())
							.collect::<Vec<_>>()
					)?;
				} else {
					write!(
						f,
						"Could not infer the tag's type because no recognized \
						 primary key was found. All tags except the root must have \
						 exactly one of the following keys: {:?}. ",
						AnyChildTagDiscriminants::iter()
							.map(|kt| kt.primary_key())
							.collect::<Vec<_>>()
					)?;
				}
				write!(
					f,
					"\nFor an in-depth description of the schema, visit \
					 https://docs.rs/collagen/{}/\
					 collagen/fibroblast/tags/enum.AnyChildTag.html",
					env!("CARGO_PKG_VERSION")
				)?;

				Ok(())
			}
		}
	}
}
