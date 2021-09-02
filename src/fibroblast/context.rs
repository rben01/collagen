use super::EMPTY_VARS;
use core::panic;
use std::collections::{btree_map::Entry as MapEntry, BTreeMap as Map, VecDeque};
use std::path::Path;

use super::data_types::{TagVariables, VariableValue};

#[derive(Debug)]
pub(crate) struct DecodingScope<'a> {
	root_path: &'a Path,
	vars: &'a TagVariables,
}

#[derive(Debug)]
pub(crate) struct DecodingContext<'a> {
	root_stack: Vec<&'a Path>,
	vars_stacks_map: Map<&'a str, Vec<&'a VariableValue>>,
}

impl<'a> DecodingContext<'a> {
	pub(crate) fn root_stack(&'a self) -> Vec<&'a Path> {
		self.root_stack
	}

	pub(crate) fn vars_stacks_map(&'a self) -> Map<&'a str, Vec<&'a VariableValue>> {
		self.vars_stacks_map
	}

	pub(crate) fn new_at_root<P: AsRef<Path> + 'a>(root_path: P) -> Self {
		let root_stack = vec![root_path.as_ref()];
		let vars_stacks_map = Map::new();

		let context = DecodingContext {
			root_stack,
			vars_stacks_map,
		};

		context
	}

	pub(crate) fn push_root<P: AsRef<Path> + 'a>(&self, root_path: P) {
		self.root_stack.push(root_path.as_ref());
	}

	pub(crate) fn pop_root(&self) {
		self.root_stack.pop().unwrap();
	}

	pub(crate) fn get_root(&'a self) -> &'a Path {
		self.root_stack.last().unwrap()
	}

	pub(crate) fn push_vars(&'a self, vars: &'a TagVariables) {
		for (k, v) in vars.0.iter() {
			self.vars_stacks_map
				.entry(k.as_ref())
				.or_insert(vec![])
				.push(v);
		}
	}

	pub(crate) fn pop_vars(&'a self, vars: &'a TagVariables) {
		for k in vars.0.keys() {
			let entry = self.vars_stacks_map.entry(k);
			match entry {
				MapEntry::Occupied(entry) => {
					let stack = entry.get_mut();
					if stack.len() == 1 {
						entry.remove();
					} else {
						stack.pop().unwrap();
					}
				}
				MapEntry::Vacant(v) => {
					panic!(
						"Tried to pop key {:?}, which was not present in the vars stack {:?}",
						k, self.vars_stacks_map
					);
				}
			}
		}
	}

	pub(crate) fn get_var(&'a self, var: &'a str) -> Option<&'a VariableValue> {
		self.vars_stacks_map
			.get(var)
			.map_or(None, |stack| stack.last())
			.map(|vref| *vref)
	}
}
