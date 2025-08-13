//! Filesystem abstraction for Collagen
//!
//! This module provides abstractions for working with both disk-backed and in-memory
//! filesystems, allowing the same code to work in CLI and WASM contexts.

use crate::from_json::{ClgnDecodingError, ClgnDecodingResult};
use std::{
	collections::HashMap,
	ffi::OsString,
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
	#[cfg(feature = "jsonnet")]
	Jsonnet,
}

impl ManifestFormat {
	pub(crate) fn manifest_filename(self) -> &'static str {
		// leading slashes are for the wasm build, and don't affect the disk-based fs
		// workings
		match self {
			ManifestFormat::Json => "/collagen.json",
			#[cfg(feature = "jsonnet")]
			ManifestFormat::Jsonnet => "/collagen.jsonnet",
		}
	}

	pub(crate) fn manifest_path(self) -> &'static Path {
		Path::new(self.manifest_filename())
	}
}

/// Content of an in-memory filesystem
#[derive(Debug, Clone)]
pub(crate) struct InMemoryFsContent {
	pub(crate) files: HashMap<PathBuf, Vec<u8>>,
}

/// In-memory filesystem implementation
#[derive(Debug, Clone)]
pub struct InMemoryFs {
	pub(crate) content: Rc<InMemoryFsContent>,
}

impl Display for InMemoryFs {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(
			f,
			"in-memory FS of {} bytes containing the following paths: {:?}",
			self.content
				.files
				.values()
				.map(|file| file.len())
				.sum::<usize>(),
			self.content.files.keys()
		)
	}
}

/// Canonicalize a path using only string operations, no filesystem access
/// This resolves relative path components like "./" and "../"
/// All paths are treated as relative to "/" (root)
fn canonicalize_path(path: impl AsRef<Path>) -> PathBuf {
	let mut components = Vec::new();

	// Split path into components, filtering out empty ones
	for component in path
		.as_ref()
		.components()
		.filter(|c| !c.as_os_str().is_empty())
	{
		// `Path::components()` already does most of the canonicalization work for us --
		// the only thing it doesn't do is handle "." and ".."
		match component.as_os_str().to_str() {
			Some(".") => {}
			Some("..") => {
				// Parent directory - pop if possible (nothing happens if empty, i.e.
				// already at root)
				components.pop();
			}
			_ => {
				// Regular component - add to path
				components.push(component);
			}
		}
	}

	if components.is_empty() {
		PathBuf::from("/")
	} else {
		let mut path_os_str = OsString::with_capacity(path.as_ref().as_os_str().len());
		for component in components {
			path_os_str.push("/");
			path_os_str.push(component);
		}
		PathBuf::from(path_os_str)
	}
}

impl InMemoryFs {
	pub(crate) fn load(&self, path: impl AsRef<Path>) -> ClgnDecodingResult<&[u8]> {
		// Canonicalize the path using pure string operations (no filesystem access)
		let canonical_path = canonicalize_path(&path);

		let InMemoryFsContent { files } = &*self.content;
		let bytes =
			files
				.get(&canonical_path)
				.ok_or_else(|| ClgnDecodingError::InMemoryFsMissingPath {
					path: canonical_path.clone(),
				})?;
		Ok(bytes)
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
