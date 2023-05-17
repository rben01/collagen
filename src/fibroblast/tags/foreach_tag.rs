use crate::{
	fibroblast::data_types::{insert_var, ConcreteNumber, VariableValue},
	ClgnDecodingResult,
};

use super::{common_tag_fields::HasVars, AnyChildTag};
use serde::{Deserialize, Serialize};

fn one() -> i64 {
	1
}

fn fals() -> bool {
	false
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum Iterable<T> {
	Atom(T),
	List(Vec<T>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum Collection {
	Range {
		start: i64,
		end: i64,
		#[serde(default = "one")]
		step: i64,
		#[serde(default = "fals")]
		closed: bool,
	},
	List(Vec<VariableValue>),
}

impl Collection {
	fn len(&self) -> usize {
		match self {
			&Collection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let d_end = if !closed {
					0
				} else if step > 0 {
					1
				} else {
					-1
				};

				let len = (end + d_end - start) / step;
				assert!(len > 0, "logic error: Collection::len() < 0");
				len as usize
			}
			Collection::List(v) => v.len(),
		}
	}
}

struct CollectionIter {
	collection: Collection,
	index: i64,
}

impl CollectionIter {
	fn new(collection: Collection) -> Self {
		Self {
			collection,
			index: 0,
		}
	}
}

impl IntoIterator for Collection {
	type Item = VariableValue;

	type IntoIter = CollectionIter;

	fn into_iter(self) -> Self::IntoIter {
		CollectionIter::new(self)
	}
}

impl Iterator for CollectionIter {
	type Item = VariableValue;

	fn next(&mut self) -> Option<Self::Item> {
		let ans = match &self.collection {
			&Collection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let next = start + step * self.index;
				let out_of_bounds = if closed {
					step > 0 && next > end || step < 0 && next < end
				} else {
					step > 0 && next >= end || step < 0 && next <= end
				};
				if out_of_bounds {
					return None;
				}
				self.index += 1;
				ConcreteNumber::Int(next).into()
			}
			Collection::List(v) => v[self.index as usize].clone(),
		};
		self.index += 1;
		Some(ans)
	}
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
struct ForeachTagSerde<'a> {
	#[serde(rename = "for_each")]
	var_name: Iterable<String>,

	#[serde(rename = "in")]
	collection: Iterable<Collection>,

	#[serde(rename = "insert")]
	tag: AnyChildTag<'a>,
}

pub struct ForeachTag<'a> {
	zipped: Vec<(String, Collection)>,
	tag: AnyChildTag<'a>,
}

impl ForeachTag<'_> {
	fn len(&self) -> usize {
		self.zipped.len()
	}
}

impl<'a> TryFrom<ForeachTagSerde<'a>> for ForeachTag<'a> {
	type Error = String;

	fn try_from(value: ForeachTagSerde<'a>) -> Result<Self, Self::Error> {
		use Iterable::*;
		let kvs = match (value.var_name, value.collection) {
			(Atom(name), Atom(collection)) => vec![(name, collection)],
			(List(names), List(collections)) => {
				let n_names = names.len();
				let n_collections = collections.len();

				if n_names == 0 || n_collections == 0 {
					return Err(format!(
						"if `for_each` and `in` are lists, they must both have \
						 length > 0. Got lengths {} and {}, respectively",
						n_names, n_collections
					));
				}

				if n_names != n_collections {
					return Err(format!(
						"when passing lists as `for_each` and `in`, they must have \
						 the same length. Got lengths {} and {}, respectively",
						n_names, n_collections
					));
				}

				let mut collections_iter = collections.iter();
				let first_collection_len = collections_iter.next().unwrap().len();

				for collection in collections_iter {
					if collection.len() != first_collection_len {
						return Err(format!(
							"all collections in a `for_each` tag must have the same length, \
							 but got one collection with length {} and another with length {}",
							first_collection_len,
							collection.len()
						));
					}
				}

				names.into_iter().zip(collections).collect()
			}
			(name, collection) => {
				return Err(format!(
					"`for_each` and `in` must be either a string and a collection, \
					 or a list of strings and a list of collections`. Mixing and matching \
					 is not allowed. Got: {:?} and {:?}",
					name, collection
				))
			}
		};

		Ok(Self {
			zipped: kvs,
			tag: value.tag,
		})
	}
}

impl<'a, 'de> Deserialize<'de> for ForeachTag<'a> {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: serde::Deserializer<'de>,
	{
		let foreach_tag_serde = ForeachTagSerde::deserialize(deserializer)?;
		Self::try_from(foreach_tag_serde).map_err(|msg| <D::Error as serde::de::Error>::custom(msg))
	}
}

impl<'a> ForeachTag<'a> {
	fn children(&'a self) -> ClgnDecodingResult<Vec<AnyChildTag<'a>>> {
		let mut children = Vec::new();

		let mut collections = self
			.zipped
			.iter()
			.map(|(k, collection)| (k, collection.clone().into_iter()))
			.collect::<Vec<_>>();

		'add_tags: loop {
			let mut tag = self.tag.clone();
			for (k, collection) in &mut collections {
				let Some(next) = collection.next() else {
					break 'add_tags;
				};

				match &mut tag {
					AnyChildTag::Image(t) => {
						insert_var(t.base_vars_mut(), k.clone(), next);
					}
					AnyChildTag::Container(_) => {}
					AnyChildTag::NestedSvg(t) => {
						insert_var(t.base_vars_mut(), k.clone(), next);
					}
					AnyChildTag::Font(t) => {
						insert_var(t.base_vars_mut(), k.clone(), next);
					}
					AnyChildTag::Other(t) => {
						insert_var(t.base_vars_mut(), k.clone(), next);
					}
				};
			}
			children.push(tag);
		}

		Ok(children)
	}
}
