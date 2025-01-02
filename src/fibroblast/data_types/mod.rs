//! Contains the data types used for the in-memory representation of a `Fibroblast`.

mod concrete_number;
mod simple_value;

pub(crate) use concrete_number::Number;
pub(crate) use simple_value::SimpleValue;
use std::{
	cell::{Ref, RefCell},
	path::PathBuf,
};

/// A context in which something can be decoded
///
/// Consists of the root path (for resolving relative paths) and a variable key-value
/// map for performing variable substitution
#[derive(Debug, Clone)]
pub struct DecodingContext {
	pub(crate) root_path: RefCell<PathBuf>,
}

impl DecodingContext {
	pub(crate) fn new(root_path: PathBuf) -> Self {
		Self {
			root_path: RefCell::new(root_path),
		}
	}

	pub(crate) fn new_at_root(root_path: PathBuf) -> Self {
		Self::new(root_path)
	}

	pub(crate) fn replace_root(&self, root: PathBuf) -> PathBuf {
		self.root_path.replace(root)
	}

	pub(crate) fn get_root(&self) -> Ref<PathBuf> {
		self.root_path.borrow()
	}
}
