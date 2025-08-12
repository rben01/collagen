//! Filesystem abstraction for Collagen
//!
//! This module provides abstractions for working with both disk-backed and in-memory
//! filesystems, allowing the same code to work in CLI and WASM contexts.

use crate::from_json::{ClgnDecodingError, ClgnDecodingResult};
use std::{
	collections::HashMap,
	fmt::Display,
	path::{Path, PathBuf},
	rc::Rc,
};

#[cfg(feature = "cli")]
use clap::ValueEnum;

/// Manifest format specification
#[derive(Debug, Copy, Clone)]
#[cfg_attr(feature = "cli", derive(ValueEnum))]
pub enum ManifestFormat {
	Json,
	Jsonnet,
}

impl ManifestFormat {
	pub(crate) fn manifest_filename(self) -> &'static str {
		match self {
			ManifestFormat::Json => "collagen.json",
			ManifestFormat::Jsonnet => "collagen.jsonnet",
		}
	}

	pub(crate) fn manifest_path(self) -> &'static Path {
		Path::new(self.manifest_filename())
	}
}

/// A slice reference into a byte vector
#[derive(Debug, Copy, Clone)]
pub struct Slice {
	pub(crate) start: usize,
	pub(crate) len: usize,
}

impl From<Slice> for std::ops::Range<usize> {
	fn from(slice: Slice) -> Self {
		slice.start..slice.start + slice.len
	}
}

/// Content of an in-memory filesystem
#[derive(Debug, Clone)]
pub(crate) struct InMemoryFsContent {
	pub(crate) bytes: Vec<u8>,
	// map of paths to slices in the byte vector
	pub(crate) slices: HashMap<PathBuf, Slice>,
}

/// In-memory filesystem implementation
#[derive(Debug, Clone)]
pub struct InMemoryFs {
	pub(crate) root_path: PathBuf,
	pub(crate) content: Rc<InMemoryFsContent>,
}

impl Display for InMemoryFs {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(
			f,
			"in-memory FS with root {:?}, containing {} paths and {} bytes",
			self.root_path,
			self.content.slices.len(),
			self.content.bytes.len()
		)
	}
}

impl InMemoryFs {
	pub(crate) fn load(&self, path: impl AsRef<Path>) -> ClgnDecodingResult<&[u8]> {
		let path = path.as_ref();
		let InMemoryFsContent { bytes, slices } = &*self.content;
		let slice = *slices
			.get(path)
			.ok_or_else(|| ClgnDecodingError::InMemoryFsMissingPath {
				path: path.to_owned(),
			})?;
		bytes.get(std::ops::Range::from(slice)).ok_or({
			ClgnDecodingError::MalformedInMemoryFs {
				slice,
				len: bytes.len(),
			}
		})
	}
}

/// Disk-backed filesystem (CLI only)
#[cfg(feature = "cli")]
#[derive(Debug, Copy, Clone)]
pub enum DiskBackedFs<'a> {
	File { file: &'a Path, parent: &'a Path },
	Folder(&'a Path),
}

#[cfg(feature = "cli")]
impl<'a> DiskBackedFs<'a> {
	#[allow(clippy::missing_panics_doc)]
	#[must_use]
	pub fn new(canonicalized_path: &'a Path) -> Self {
		let path = canonicalized_path;
		if path.is_dir() {
			Self::Folder(path)
		} else {
			Self::File {
				file: path,
				parent: path
					.parent()
					.unwrap_or_else(|| panic!("could not get parent of {path:?}")),
			}
		}
	}

	#[cfg(test)]
	pub(crate) fn new_folder_unchecked(path: &'a Path) -> Self {
		Self::Folder(path)
	}

	pub(crate) fn folder(&self) -> &Path {
		match self {
			Self::File { parent, file: _ } => parent,
			Self::Folder(p) => p,
		}
	}
}

/// Input abstraction that works with both CLI and WASM
#[derive(Debug, Clone)]
pub enum ProvidedInput<'a> {
	#[cfg(feature = "cli")]
	DiskBackedFs(DiskBackedFs<'a>),
	// PhantomData needed so this will compile even when feature "cli" is disabled --
	// otherwise we'll have an unused generic parameter.
	InMemoryFs(InMemoryFs, std::marker::PhantomData<&'a ()>),
}

impl ProvidedInput<'_> {
	#[cfg(feature = "cli")]
	pub(crate) fn name(&self) -> std::borrow::Cow<'_, Path> {
		match self {
			#[cfg(feature = "cli")]
			ProvidedInput::DiskBackedFs(fs) => std::borrow::Cow::Borrowed(fs.folder()),
			ProvidedInput::InMemoryFs(fs, _) => {
				std::borrow::Cow::Owned(PathBuf::from(fs.to_string()))
			}
		}
	}
}

// macro_rules! impl_maybe_lifetime {
// 	(impl $type_with_lifetime:ty | $type_without_lifetime:path { $($tt:tt)* }) => {
// 		  #[cfg(feature = "cli")]
// 		  impl $type_with_lifetime { $($tt)* }

// 		  #[cfg(not(feature = "cli"))]
// 		  impl $type_without_lifetime { $($tt)* }
// 	 };
// 	 (impl $trait_with_lifetime:ty | $trait_without_lifetime:ty : $type:ty { $tt:tt }) => {
// 		  #[cfg(feature = "cli")]
// 		  impl $trait_with_lifetime for $type { $tt }

// 		  #[cfg(not(feature = "cli"))]
// 		  impl $trait_without_lifetime for $type { $tt }
// 	 };
// }

// impl_maybe_lifetime!(
// 	impl ProvidedInput<'_> | ProvidedInput {
// 		pub(crate) fn name(&self) -> std::borrow::Cow<'_, Path> {
// 			match self {
// 				#[cfg(feature = "cli")]
// 				ProvidedInput::DiskBackedFs(fs) => std::borrow::Cow::Borrowed(fs.folder()),
// 				ProvidedInput::InMemoryFs(fs) => std::borrow::Cow::Owned(PathBuf::from(fs.to_string())),
// 			}
// 		}
// 	}
// );
