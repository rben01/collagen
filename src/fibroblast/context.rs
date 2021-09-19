use std::cell::{Ref, RefCell};
use std::collections::{btree_map::Entry as MapEntry, BTreeMap as Map};
use std::path::{Path, PathBuf};

use crate::to_svg::svg_writable::ClgnDecodingResult;

use super::data_types::{TagVariables, VariableValue};

/// A context in which something can be decoded
///
/// Consists of the root path (for resolving relative paths) and a variable key-value
/// map for performing variable subtition
#[derive(Debug, Clone)]
pub(crate) struct DecodingContext<'a> {
	root_path: RefCell<PathBuf>, // can this be turned into a `Cow<'a, Path>`?
	vars_map: RefCell<Map<&'a str, &'a VariableValue>>,
}

impl<'a> DecodingContext<'a> {
	pub(crate) fn vars_map(&self) -> Ref<Map<&'a str, &'a VariableValue>> {
		self.vars_map.borrow()
	}

	pub(crate) fn replace_root<P: AsRef<Path>>(&self, root: P) -> PathBuf {
		self.root_path.replace(root.as_ref().to_owned())
	}

	pub(crate) fn new_at_root<P: AsRef<Path>>(root_path: P) -> Self {
		let root_path = RefCell::new(root_path.as_ref().to_owned());
		let vars_map = RefCell::new(Map::new());

		DecodingContext {
			root_path,
			vars_map,
		}
	}

	pub(crate) fn with_new_root<T, P: AsRef<Path>, F: FnOnce() -> ClgnDecodingResult<T>>(
		&self,
		new_root: P,
		f: F,
	) -> ClgnDecodingResult<T> {
		let orig_path = self.replace_root(new_root);
		let result = f();
		self.replace_root(orig_path);
		result
	}

	pub(crate) fn get_root(&self) -> Ref<PathBuf> {
		self.root_path.borrow()
	}

	pub(crate) fn with_new_vars<T, F: FnOnce() -> ClgnDecodingResult<T>>(
		&self,
		vars: &TagVariables,
		f: F,
	) -> ClgnDecodingResult<T> {
		let mut orig_vars = Vec::<(&str, Option<&VariableValue>)>::new();

		// Update `my_vars` with `vars`
		let mut my_vars = self.vars_map.borrow_mut();
		for (k, v) in vars.0.iter() {
			let k = k.as_ref() as *const str;
			let v = v as *const VariableValue;
			unsafe {
				let entry = my_vars.entry(&*k);
				match entry {
					MapEntry::Occupied(mut occ) => {
						orig_vars.push((&*k, Some(occ.insert(&*v))));
					}
					MapEntry::Vacant(vac) => {
						orig_vars.push((&*k, None));
						vac.insert(&*v);
					}
				}
			}
		}

		// Remove the borrow_mut while f executes
		drop(my_vars);

		let result = f();

		// Re-borrow_mut to restore to original state
		let mut my_vars = self.vars_map.borrow_mut();
		for (k, v) in orig_vars {
			match v {
				Some(v) => my_vars.insert(k, v),
				None => my_vars.remove(k),
			}
			.unwrap(); // Panic if we had a logic error and a key somehow wasn't present
		}

		result
	}

	pub(crate) fn get_var(&self, var: &str) -> Option<&'a VariableValue> {
		self.vars_map.borrow().get(var).copied()
	}
}
