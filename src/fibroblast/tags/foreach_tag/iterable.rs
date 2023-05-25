use super::collection::UnprocessedLoopCollection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopVariable {
	#[serde(rename = "variable")]
	pub(super) name: String,
	#[serde(rename = "in")]
	pub(super) loop_collection: UnprocessedLoopCollection,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum Loop {
	Atom(LoopVariable),
	List(Vec<LoopVariable>),
}

impl<'a> IntoIterator for &'a Loop {
	type Item = &'a LoopVariable;
	type IntoIter = LoopIter<'a>;

	fn into_iter(self) -> Self::IntoIter {
		LoopIter::new(self)
	}
}

pub struct LoopIter<'a> {
	iterable: &'a Loop,
	index: usize,
	len: usize,
}

impl<'a> LoopIter<'a> {
	fn new(iterable: &'a Loop) -> Self {
		let len = match iterable {
			Loop::Atom(_) => 1,
			Loop::List(v) => v.len(),
		};
		Self {
			iterable,
			index: 0,
			len,
		}
	}
}

impl<'a> Iterator for LoopIter<'a> {
	type Item = &'a LoopVariable;

	fn next(&mut self) -> Option<Self::Item> {
		let Self {
			iterable,
			index,
			len,
		} = self;

		if *index >= *len {
			return None;
		}

		let next = match &*iterable {
			Loop::Atom(x) => x,
			Loop::List(v) => &v[*index],
		};

		*index += 1;
		Some(next)
	}
}
