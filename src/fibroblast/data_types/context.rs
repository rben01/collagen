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

use lazy_static::lazy_static;
use regex::Regex;
use std::borrow::Cow;
use std::cell::{Ref, RefCell};
use std::collections::{btree_map::Entry as MapEntry, BTreeMap as Map};
use std::path::{Path, PathBuf};

#[cfg(test)]
use std::str::FromStr;

use crate::to_svg::svg_writable::ClgnDecodingResult;

use super::{AttrKVValueVec, SimpleValue, TagVariables, VariableValue};

lazy_static! {
	static ref VAR_NAME_CHAR_RE: Regex = Regex::new(r"\w").unwrap();
}

/// It's really tempting to want to change these `String`s to `&'a str`s, but if you do
/// that, then [`ClgnDecodingError`] — and hence [`ClgnDecodingResult`] — need lifetimes
/// too. Yech.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum VariableSubstitutionError {
	VariableNameError {
		illegal_names: Vec<String>,
		missing_from_context: Vec<String>,
	},
	UnterminatedVariableName(String),
}

#[cfg(test)]
impl VariableSubstitutionError {
	fn new_with_missing_vars(var_names: Vec<String>) -> Self {
		VariableSubstitutionError::VariableNameError {
			illegal_names: vec![],
			missing_from_context: var_names,
		}
	}

	fn new_with_illegal_names(var_names: Vec<String>) -> Self {
		VariableSubstitutionError::VariableNameError {
			illegal_names: var_names,
			missing_from_context: vec![],
		}
	}
}

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
	pub(crate) fn new_empty() -> Self {
		Self::new(PathBuf::from_str("").unwrap(), Map::new())
	}

	#[cfg(test)]
	pub(crate) fn new_with_vars<I: IntoIterator<Item = (&'a str, &'a VariableValue)>>(
		vars_intoiter: I,
	) -> Self {
		Self::new(PathBuf::from_str("").unwrap(), vars_intoiter)
	}

	pub(crate) fn new_at_root<P: AsRef<Path>>(root_path: P) -> Self {
		Self::new(root_path.as_ref().to_owned(), Map::new())
	}

	pub(crate) fn replace_root<P: AsRef<Path>>(&self, root: P) -> PathBuf {
		self.root_path.replace(root.as_ref().to_owned())
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

	#[cfg(test)]
	pub(crate) fn vars_map(&self) -> Ref<Map<&str, &VariableValue>> {
		self.vars_map.borrow()
	}

	/// Append the given variables to self (i.e., introduce them as a nested scope),
	/// call `f()` in this scope. `self` is not mutated.
	///
	/// > Actually `self` *is* mutated via `RefCell`, but only temporarily -- it is
	/// modified to create the correct state for `f` to be called in and then it's
	/// restored to its original state so that it is as if it had never changed at all.
	/// (It might be regarded as "net non-mutating".)
	///
	/// > *CAUTION*: For this reason, this function is almost certainly not thread safe.
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
			// See comment above for why this is (not thread- !) safe. tl;dr the short-lived entries are
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

		// Remove the borrow_mut while f executes, since f may need it itself
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

	pub(crate) fn sub_vars_into_str<'b>(
		&self,
		s: &'b str,
	) -> Result<Cow<'b, str>, VariableSubstitutionError> {
		enum ParseState {
			Normal,
			InsideBracesValid,
			InsideBracesInvalid,
		}
		use ParseState::*;

		let mut did_make_subn = false;
		let mut string_result = String::new();

		let mut parse_state = ParseState::Normal;
		let mut prev_was_backslash = false;
		let mut left = 0;

		let mut missing_var_names = vec![];
		let mut illegal_var_names = vec![];

		// Don't really know what I'm doing when it comes to parsing, but this works, so
		// ¯\_(ツ)_/¯
		for (i, c) in s.chars().into_iter().enumerate() {
			match (prev_was_backslash, &parse_state, c) {
				(false, _, '\\') => {
					prev_was_backslash = true;
				}
				(false, Normal, '{') => {
					string_result.push_str(&s[left..i]);
					left = i + c.len_utf8();
					parse_state = InsideBracesValid;
				}
				(false, InsideBracesValid, '}') if i > left => {
					did_make_subn = true;

					let var_name = &s[left..i];
					let var_value = self.get_var(var_name);
					match var_value {
						Some(var_value) => string_result.push_str(&var_value.as_str()),
						None => missing_var_names.push(var_name.to_owned()),
					}

					left = i + c.len_utf8();
					parse_state = Normal;
				}
				(false, _, '}') => {
					illegal_var_names.push(s[left..i].to_string());
					parse_state = Normal;
				}
				(false, InsideBracesValid, c) if !VAR_NAME_CHAR_RE.is_match(&c.to_string()) => {
					parse_state = InsideBracesInvalid;
				}

				(true, Normal, '{' | '\\') => {
					let i = i - '\\'.len_utf8();
					string_result.push_str(&s[left..i]);
					left = i + c.len_utf8();
					prev_was_backslash = false;
				}
				_ => {}
			}
		}

		match parse_state {
			Normal => {
				if !missing_var_names.is_empty() || !illegal_var_names.is_empty() {
					Err(VariableSubstitutionError::VariableNameError {
						illegal_names: illegal_var_names,
						missing_from_context: missing_var_names,
					})
				} else {
					string_result.push_str(&s[left..]);
					Ok(if did_make_subn {
						Cow::Owned(string_result)
					} else {
						Cow::Borrowed(s)
					})
				}
			}
			InsideBracesValid | InsideBracesInvalid => Err(
				VariableSubstitutionError::UnterminatedVariableName(s[left..].to_string()),
			),
		}
	}

	pub(crate) fn sub_vars_into_attrs<'b, I>(
		&self,
		attrs: I,
	) -> ClgnDecodingResult<AttrKVValueVec<'b>>
	where
		I: IntoIterator<Item = (&'b str, Cow<'b, SimpleValue>)>,
	{
		let attrs_iter = attrs.into_iter();
		let n_attrs = match attrs_iter.size_hint() {
			(_, Some(upper)) => upper,
			(lower, _) => lower,
		};
		let mut subd_attrs = Vec::with_capacity(n_attrs);

		for (k, orig_val) in attrs_iter {
			// Looks brutal, but can be summed up as follows: try to reuse the existing
			// Cow using it as-is or borrowing what it contains; only create a new
			// Cow::Owned if absolutely necessary. When is it necessary? When the
			// original Cow contains Text and that Text has substitutions performed on
			// it (so that we can't reuse the original)
			//
			// In other words, this is a very complicated-looking operation that really
			// just ensures ownership "checks out" after substituting.

			let subd_val = match &orig_val {
				Cow::Owned(owned_val) => match owned_val {
					SimpleValue::Text(text) => {
						let subd_text = self.sub_vars_into_str(text)?;
						match subd_text {
							Cow::Owned(s) => Cow::Owned(SimpleValue::Text(s)),
							_orig_text => orig_val,
						}
					}
					// SimpleValue::Number(n) => Cow::Owned(SimpleValue::Number(*n)),
					_wasnt_text => orig_val,
				},
				Cow::Borrowed(borrowed_val) => match borrowed_val {
					SimpleValue::Text(text) => {
						let subd_text = self.sub_vars_into_str(text)?;
						match subd_text {
							Cow::Owned(s) => Cow::Owned(SimpleValue::Text(s)),
							_orig_text => Cow::Borrowed(*borrowed_val),
						}
					}
					_wasnt_text => Cow::Borrowed(*borrowed_val),
				},
			};

			subd_attrs.push((k, subd_val));
		}

		Ok(subd_attrs)
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::fibroblast::data_types::{ConcreteNumber as CN, VariableValue as VV};

	struct Illegal<'a>(Vec<&'a str>);
	struct Missing<'a>(Vec<&'a str>);

	mod vars {
		use super::*;
		use std::iter::FromIterator;

		#[test]
		fn empty() {
			let context = DecodingContext::new_empty();

			assert_eq!(context.vars_map().len(), 0);

			let v1 = context.get_var("");
			assert!(v1.is_none());

			let v2 = context.get_var("x");
			assert!(v2.is_none());
		}

		#[test]
		fn nonempty() {
			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &xyz_string),
			]);

			assert_eq!(context.vars_map().len(), 4);

			assert_eq!(context.get_var("a"), Some(&VV::Number(CN::Int(1))));
			assert_eq!(context.get_var("b"), Some(&VV::Number(CN::UInt(2))));
			assert_eq!(context.get_var("c"), Some(&VV::Number(CN::Float(3.0))));
			assert_eq!(context.get_var("d"), Some(&VV::String(xyz_ref.to_string())));
		}

		#[test]
		fn with_new_vars() {
			let xyz_ref = "xyz";

			// Suffix `_n` denotes depth n of nested scopes
			let a_val_0 = VV::Number(CN::Int(1));
			let b_val_0 = VV::Number(CN::UInt(2));
			let c_val_0 = VV::String(xyz_ref.to_string());
			let context = DecodingContext::new_with_vars(vec![
				("a", &a_val_0),
				("b", &b_val_0),
				("c", &c_val_0),
			]);

			let assert_unchanged_0 = || {
				assert_eq!(context.get_var("a"), Some(&a_val_0));
				assert_eq!(context.get_var("b"), Some(&b_val_0));
				assert_eq!(context.get_var("c"), Some(&c_val_0));
			};
			assert_unchanged_0();

			let empty_new_vars = TagVariables(Map::new());
			context
				.with_new_vars(&empty_new_vars, || {
					assert_eq!(context.get_var("a"), Some(&a_val_0));
					assert_eq!(context.get_var("b"), Some(&b_val_0));
					assert_eq!(context.get_var("c"), Some(&c_val_0));

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();

			// For the sake of the discerning the outcome of the test, no two values should be equal
			let a_val_1 = VV::Number(CN::UInt(3));
			let d_val_1 = VV::String("added_value".to_string());
			let nonempty_new_vars = TagVariables(Map::from_iter(vec![
				("a".to_owned(), a_val_1.clone()),
				("d".to_owned(), d_val_1.clone()),
			]));
			context
				.with_new_vars(&nonempty_new_vars, || {
					assert_eq!(context.get_var("a"), Some(&a_val_1));
					assert_eq!(context.get_var("b"), Some(&b_val_0));
					assert_eq!(context.get_var("c"), Some(&c_val_0));
					assert_eq!(context.get_var("d"), Some(&d_val_1));

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();

			// Test another level of nesting, repeated `with_new_vars` calls, etc
			context
				.with_new_vars(&nonempty_new_vars, || {
					let assert_unchanged_1 = || {
						assert_eq!(context.get_var("a"), Some(&a_val_1));
						assert_eq!(context.get_var("b"), Some(&b_val_0));
						assert_eq!(context.get_var("c"), Some(&c_val_0));
					};

					let a_val_2 = VV::String("this is a_val_3".to_owned());
					let c_val_2 = VV::Number(CN::Float(5.5));
					let nonempty_new_vars_2 = TagVariables(Map::from_iter(vec![
						("a".to_owned(), a_val_2.clone()),
						("b".to_owned(), b_val_0.clone()),
						("c".to_owned(), c_val_2.clone()),
					]));

					context
						.with_new_vars(&nonempty_new_vars_2, || {
							assert_eq!(context.get_var("a"), Some(&a_val_2));
							assert_eq!(context.get_var("b"), Some(&b_val_0));
							assert_eq!(context.get_var("c"), Some(&c_val_2));
							assert_eq!(context.get_var("d"), Some(&d_val_1));

							Ok(())
						})
						.unwrap();
					assert_unchanged_1();

					context
						.with_new_vars(&nonempty_new_vars_2, || {
							assert_eq!(context.get_var("a"), Some(&a_val_2));
							assert_eq!(context.get_var("b"), Some(&b_val_0));
							assert_eq!(context.get_var("c"), Some(&c_val_2));
							assert_eq!(context.get_var("d"), Some(&d_val_1));

							Ok(())
						})
						.unwrap();
					assert_unchanged_1();

					Ok(())
				})
				.unwrap();
			assert_unchanged_0();
		}
	}

	mod root {
		use super::*;

		#[test]
		fn with_new() {
			let context = DecodingContext::new_at_root("root0");

			assert_eq!(*context.get_root(), Path::new("root0"));

			context
				.with_new_root("root1", || {
					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root2", || {
							assert_eq!(*context.get_root(), Path::new("root2"));
							Ok(())
						})
						.unwrap();

					assert_eq!(*context.get_root(), Path::new("root1"));

					context
						.with_new_root("root3", || {
							assert_eq!(*context.get_root(), Path::new("root3"));
							Ok(())
						})
						.unwrap();

					assert_eq!(*context.get_root(), Path::new("root1"));

					Ok(())
				})
				.unwrap();

			assert_eq!(*context.get_root(), Path::new("root0"));
		}
	}

	mod substitution {
		use super::*;

		#[test]
		fn ok() {
			let empty_context = DecodingContext::new_empty();
			assert_eq!(empty_context.sub_vars_into_str("").unwrap(), "");
			assert_eq!(empty_context.sub_vars_into_str("xyz").unwrap(), "xyz");

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &VV::Number(CN::Float(4.5))),
				("e", &xyz_string),
			]);
			assert_eq!(nonempty_context.sub_vars_into_str("").unwrap(), "");
			assert_eq!(nonempty_context.sub_vars_into_str("xyz").unwrap(), "xyz");

			assert_eq!(nonempty_context.sub_vars_into_str(" {a} ").unwrap(), " 1 ");

			// Something to note is that floats with 0 fractional part are written as if
			// they were ints, e.g., 10.0 becomes "10", not "10.0"
			assert_eq!(
				nonempty_context
					.sub_vars_into_str("{a}; {b}; {c}; {d}; {e}")
					.unwrap(),
				"1; 2; 3; 4.5; xyz"
			);
		}

		#[test]
		fn missing_vars() {
			#[track_caller]
			fn test<S: AsRef<str>>(context: &DecodingContext, input: S, missing: Missing) {
				assert_eq!(
					context.sub_vars_into_str(input.as_ref()).err().unwrap(),
					VariableSubstitutionError::new_with_missing_vars(
						missing.0.iter().map(|&s| s.to_owned()).collect()
					)
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(
				&empty_context,
				"{missing_var}",
				Missing(vec!["missing_var"]),
			);
			test(&empty_context, "{mv1} {mv2}", Missing(vec!["mv1", "mv2"]));
			test(
				&empty_context,
				"a {mv1} b {mv2} c",
				Missing(vec!["mv1", "mv2"]),
			);

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &xyz_string),
			]);

			test(
				&nonempty_context,
				"{mv1} {mv2}",
				Missing(vec!["mv1", "mv2"]),
			);
			test(&nonempty_context, "{a} {mv2}", Missing(vec!["mv2"]));
			test(
				&nonempty_context,
				"{a} {mv2} {mv2} {mv2}",
				Missing(vec!["mv2", "mv2", "mv2"]),
			);
			test(
				&nonempty_context,
				"{a} {b} {mv1} {mv2}",
				Missing(vec!["mv1", "mv2"]),
			);
			test(
				&nonempty_context,
				"{a} {mv1} {mv1} {mv2} {mv1} {mv2} {mv2} {b} ",
				Missing(vec!["mv1", "mv1", "mv2", "mv1", "mv2", "mv2"]),
			);

			// Not actually missing any
			assert!(nonempty_context.sub_vars_into_str("{a} {b}").is_ok());
		}

		#[test]
		fn illegal_var_names() {
			#[track_caller]
			fn test<S: AsRef<str>>(input: S, illegal: Illegal, context: &DecodingContext) {
				assert_eq!(
					context.sub_vars_into_str(input.as_ref()).err().unwrap(),
					VariableSubstitutionError::new_with_illegal_names(
						illegal.0.iter().map(|&s| s.to_owned()).collect()
					)
				)
			}

			let empty_context = DecodingContext::new_empty();

			test("{}", Illegal(vec![""]), &empty_context);
			test("{ }", Illegal(vec![" "]), &empty_context);
			test("{\n}", Illegal(vec!["\n"]), &empty_context);
			test("{ a }", Illegal(vec![" a "]), &empty_context);
			test("{a.}", Illegal(vec!["a."]), &empty_context);
			test("{ .}", Illegal(vec![" ."]), &empty_context);

			test("{} {}", Illegal(vec!["", ""]), &empty_context);
			test("{ } {}", Illegal(vec![" ", ""]), &empty_context);
			test("{} { }", Illegal(vec!["", " "]), &empty_context);
			test("{ } { }", Illegal(vec![" ", " "]), &empty_context);
			test(
				"{} { } {  } { a } { a } { b } {}",
				Illegal(vec!["", " ", "  ", " a ", " a ", " b ", ""]),
				&empty_context,
			);
		}

		#[test]
		fn illegal_and_missing_var_names() {
			#[track_caller]
			fn test<S: AsRef<str>>(
				input: S,
				illegal: Illegal,
				missing: Missing,
				context: &DecodingContext,
			) {
				assert_eq!(
					context.sub_vars_into_str(input.as_ref()).err().unwrap(),
					VariableSubstitutionError::VariableNameError {
						illegal_names: (illegal.0).iter().map(|&s| s.to_owned()).collect(),
						missing_from_context: (missing.0).iter().map(|&s| s.to_owned()).collect()
					}
				)
			}

			let empty_context = DecodingContext::new_empty();

			test(
				"{} {a}",
				Illegal(vec![""]),
				Missing(vec!["a"]),
				&empty_context,
			);

			test(
				"{} {a}",
				Illegal(vec![""]),
				Missing(vec!["a"]),
				&empty_context,
			);

			test(
				"{} {a} {} {a}",
				Illegal(vec!["", ""]),
				Missing(vec!["a", "a"]),
				&empty_context,
			);

			test(
				"{} {a} { } {b}",
				Illegal(vec!["", " "]),
				Missing(vec!["a", "b"]),
				&empty_context,
			);

			test(
				"{} { a } { } { b }",
				Illegal(vec!["", " a ", " ", " b "]),
				Missing(vec![]),
				&empty_context,
			);

			test(
				"{a} {b} {c} {d}",
				Illegal(vec![]),
				Missing(vec!["a", "b", "c", "d"]),
				&empty_context,
			);

			let xyz_ref = "xyz";
			let xyz_string = VV::String(xyz_ref.to_string());
			let nonempty_context = DecodingContext::new_with_vars(vec![
				("a", &VV::Number(CN::Int(1))),
				("b", &VV::Number(CN::UInt(2))),
				("c", &VV::Number(CN::Float(3.0))),
				("d", &xyz_string),
			]);

			test(
				"{} {a} {} {a}",
				Illegal(vec!["", ""]),
				Missing(vec![]),
				&nonempty_context,
			);

			test(
				"{} {a} { } {e}",
				Illegal(vec!["", " "]),
				Missing(vec!["e"]),
				&nonempty_context,
			);

			test(
				"{} { a } { } { b }",
				Illegal(vec!["", " a ", " ", " b "]),
				Missing(vec![]),
				&nonempty_context,
			);

			test(
				"{a} {b} { c } { d } {e}",
				Illegal(vec![" c ", " d "]),
				Missing(vec!["e"]),
				&nonempty_context,
			);

			assert!(nonempty_context
				.sub_vars_into_str("{a} {b} {c} {d}")
				.is_ok());
		}
	}
}
