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

pub(crate) mod errors;
pub(super) mod functions;
pub(crate) mod parser;

use super::{ConcreteNumber, SimpleValue, TagVariables, VariableValue, XmlAttrsBorrowed};
use crate::{
	to_svg::svg_writable::ClgnDecodingResult,
	utils::{Map, MapEntry, Set},
};
use errors::{VariableEvaluationError, VariableSubstitutionResult};
use parser::parse;
use std::{
	borrow::Cow,
	cell::{Ref, RefCell},
	path::PathBuf,
};

/// A context in which something can be decoded
///
/// Consists of the root path (for resolving relative paths) and a variable key-value
/// map for performing variable substitution
#[derive(Debug, Clone)]
pub struct DecodingContext<'a> {
	root_path: RefCell<PathBuf>,
	vars_map: RefCell<Map<&'a str, &'a VariableValue>>,
}

impl<'a> DecodingContext<'a> {
	pub(crate) fn new(
		root_path: PathBuf,
		vars_intoiter: impl IntoIterator<Item = (&'a str, &'a VariableValue)>,
	) -> Self {
		let vars_ref_map = vars_intoiter.into_iter().collect();

		Self {
			root_path: RefCell::new(root_path),
			vars_map: RefCell::new(vars_ref_map),
		}
	}
}
impl DecodingContext<'_> {
	pub(crate) fn new_at_root(root_path: PathBuf) -> Self {
		Self::new(root_path, Map::new())
	}

	pub(crate) fn replace_root(&self, root: PathBuf) -> PathBuf {
		self.root_path.replace(root)
	}

	pub(crate) fn with_new_root<T>(
		&self,
		new_root: PathBuf,
		f: impl FnOnce() -> ClgnDecodingResult<T>,
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

	pub(crate) fn get_var(&self, var: &str) -> Option<&VariableValue> {
		self.vars_map.borrow().get(var).copied()
	}

	fn eval_variable(
		&self,
		var: &str,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<VariableValue> {
		let mut parsing_errs = Vec::new();
		if variables_referenced.contains(var) {
			parsing_errs.push(VariableEvaluationError::RecursiveSubstitutionError {
				variable: var.to_owned(),
			});
		}

		let Some(val) =  self.get_var(var) else{
			parsing_errs.push(VariableEvaluationError::MissingVariable(var.to_owned()));
			return Err(parsing_errs);
		};
		Ok(match val {
			VariableValue::Number(n) => (*n).into(),
			VariableValue::String(s) => {
				if !parsing_errs.is_empty() {
					return Err(parsing_errs);
				}

				let mut variables_referenced = variables_referenced.clone();
				variables_referenced.insert(var.to_owned());
				match self.eval_exprs_in_str_helper(s, &variables_referenced) {
					Ok(x) => match x.parse() {
						Ok(n) => ConcreteNumber::Float(n).into(),
						Err(_) => x.into_owned().into(),
					},
					Err(e) => {
						parsing_errs.extend(e);
						return Err(parsing_errs);
					}
				}
			}
		})
	}

	pub(crate) fn eval_exprs_in_str<'b>(
		&self,
		s: &'b str,
	) -> VariableSubstitutionResult<Cow<'b, str>> {
		parse(s, self, &Set::new())
	}

	fn eval_exprs_in_str_helper<'b>(
		&self,
		s: &'b str,
		variables_referenced: &Set<String>,
	) -> VariableSubstitutionResult<Cow<'b, str>> {
		parse(s, self, variables_referenced)
	}

	pub(crate) fn sub_vars_into_attrs<'b, I>(
		&self,
		attrs: I,
	) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>>
	where
		I: IntoIterator<Item = (&'b str, Cow<'b, SimpleValue>)>,
	{
		let attrs_iter = attrs.into_iter();
		let n_attrs = match attrs_iter.size_hint() {
			(_, Some(upper)) => upper,
			(lower, _) => lower,
		};
		let mut subd_attrs = Vec::with_capacity(n_attrs);

		let mut parsing_errs = Vec::new();

		for (k, orig_val) in attrs_iter {
			let new_val = match orig_val.as_ref() {
				SimpleValue::Text(text) => {
					let subd_text = match self.eval_exprs_in_str(text) {
						Ok(x) => x,
						Err(e) => {
							parsing_errs.extend(e);
							continue;
						}
					};
					match subd_text {
						Cow::Owned(s) => Cow::Owned(SimpleValue::Text(s)),
						Cow::Borrowed(_orig) => orig_val,
					}
				}
				_wasnt_text => orig_val,
			};

			subd_attrs.push((k, new_val));
		}

		if !parsing_errs.is_empty() {
			return Err(parsing_errs.into());
		}

		Ok(XmlAttrsBorrowed(subd_attrs))
	}
}

#[cfg(test)]
mod test;
