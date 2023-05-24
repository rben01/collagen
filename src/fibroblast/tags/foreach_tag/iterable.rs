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
}

impl<'a> LoopIter<'a> {
	fn new(iterable: &'a Loop) -> Self {
		Self { iterable, index: 0 }
	}
}

impl<'a> Iterator for LoopIter<'a> {
	type Item = &'a LoopVariable;

	fn next(&mut self) -> Option<Self::Item> {
		let Self { iterable, index } = self;
		let next = match &*iterable {
			Loop::Atom(x) => {
				if *index > 0 {
					return None;
				}
				x
			}
			Loop::List(v) => {
				if *index >= v.len() {
					return None;
				}
				&v[*index]
			}
		};

		*index += 1;
		Some(next)
	}
}
