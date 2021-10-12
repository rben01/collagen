//! This file contains `struct DecodingContext`, a type whose instances hold everything
//! needed to decode an object. This is needed because (AFAICT) `serde` lacks the
//! ability to inject external state into the deserialization process. As a result,
//! objects are deserialied into a state which does not contain all information needed
//! for decoding; supplying the context in which they are being decoded allows one to
//! complete the decoding.
//!
//! Example: paths are specified relative to some "root path" which is determined at
//! runtime and is not (de)serialized. So in order for the full path to be obtained from
//! a deserialized `path`, the root path must also be supplied; only then can decoding
//! proceed.

use std::cell::{Ref, RefCell};
use std::collections::{btree_map::Entry as MapEntry, BTreeMap as Map};
use std::path::{Path, PathBuf};

#[cfg(test)]
use std::str::FromStr;

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

	pub(crate) fn new<I: IntoIterator<Item = (&'a str, &'a VariableValue)>>(
		root_path: PathBuf,
		vars_intoiter: I,
	) -> Self {
		let vars_ref_map = vars_intoiter.into_iter().collect();

		Self {
			root_path: RefCell::new(root_path),
			vars_map: RefCell::new(vars_ref_map),
		}
	}

	#[cfg(test)]
	pub(crate) fn new_with_varsintoiter<I: IntoIterator<Item = (&'a str, &'a VariableValue)>>(
		vars_vec: I,
	) -> Self {
		Self::new(PathBuf::from_str("").unwrap(), vars_vec)
	}

	pub(crate) fn new_at_root<P: AsRef<Path>>(root_path: P) -> Self {
		Self::new(root_path.as_ref().to_owned(), Map::new())
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

	/// Append the given variables to self (i.e., introduce them as a nested scope),
	/// call `f()` in this scope. `self` is not mutated.
	///
	/// Actually `self` *is* mutated via `RefCell`, but only temporarily -- it is
	/// modified to create the correct state for `f` to be called in and then it's
	/// restored to its original state so that it is as if it had never changed at all.
	/// (It might be regarded as "net non-mutating".) For this reason, this function is
	/// almost certainly not thread safe.
	pub(crate) fn with_new_vars<T, F: FnOnce() -> ClgnDecodingResult<T>>(
		&self,
		vars: &TagVariables,
		f: F,
	) -> ClgnDecodingResult<T> {
		// This function requires a little trickery. Since we're adding `&str` keys to
		// `self`'s map, the Rust compiler thinks those keys need to outlive `self`.
		// But, actually, they *don't* need to because `self` is restored to its
		// original state before this function returns; those keys definitely won't be
		// dropped before being removed from the map. But the Rust compiler can't figure
		// this out. Hence the use of `unsafe`.

		let mut orig_vars = Vec::<(&str, Option<&VariableValue>)>::new();

		// Update `my_vars` with `vars`
		let mut my_vars = self.vars_map.borrow_mut();
		for (k, v) in vars.0.iter() {
			// See comment above for why this is safe. tl;dr the short-lived entries are
			// removed from the map before they have a chance to be dropped
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
		// Nothing is really copied here; self.vars_map.borrow().get(var) returns a
		// double reference `&&T`, which we just want to turn into a `&T` (so, sure, a
		// pointer is copied. NBD)
		self.vars_map.borrow().get(var).copied()
	}
}

#[cfg(test)]
mod tests {

	use super::*;

	#[test]
	fn test_empty_vars() {
		let context = DecodingContext::new_with_varsintoiter(vec![]);

		assert_eq!(context.vars_map().len(), 0);

		let v1 = context.get_var("");
		assert!(v1.is_none());

		let v2 = context.get_var("x");
		assert!(v2.is_none());
	}

	#[test]
	fn test_nonempty_vars() {
		use super::super::data_types::ConcreteNumber as CN;
		use VariableValue::*;

		let xyz_ref = "xyz";
		let xyz_string = String(xyz_ref.to_string());
		let context = DecodingContext::new_with_varsintoiter(vec![
			("a", &Number(CN::Int(1))),
			("b", &Number(CN::UInt(2))),
			("c", &Number(CN::Float(3.0))),
			("d", &xyz_string),
		]);

		assert_eq!(context.vars_map().len(), 4);

		match context.get_var("a") {
			Some(Number(CN::Int(1))) => {}
			_ => {
				panic!("Expected key \"a\" to have value 1 (i64)")
			}
		};

		match context.get_var("b") {
			Some(Number(CN::UInt(2))) => {}
			_ => {
				panic!("Expected key \"b\" to have value 2 (u64)")
			}
		};

		match context.get_var("c") {
			Some(Number(CN::Float(v))) if v.eq(&3.0) => {}
			_ => {
				panic!("Expected key \"c\" to have value 3.0 (f64)")
			}
		};

		match context.get_var("d") {
			Some(String(s)) if s == xyz_ref => {}
			_ => {
				panic!("Expected key \"d\" to have value \"xyz\" (String)")
			}
		};
	}
}
