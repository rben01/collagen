use std::num::NonZeroI64;

use crate::{
	dispatch_to_common_tag_fields,
	fibroblast::data_types::{insert_var, ConcreteNumber, VariableValue},
	ClgnDecodingResult,
};

use super::{
	common_tag_fields::{HasCommonTagFields, HasVars},
	AnyChildTag, CommonTagFields, XmlAttrs,
};
use lazycell::LazyCell;

use serde::{Deserialize, Deserializer, Serialize};

fn de_nonempty_vec<'de, D, T: Deserialize<'de>>(deserializer: D) -> Result<Vec<T>, D::Error>
where
	D: Deserializer<'de>,
{
	let v = Vec::deserialize(deserializer)?;
	if v.is_empty() {
		return Err(<D::Error as serde::de::Error>::invalid_length(
			0,
			&"the list of variables to loop over in a `for_each_in` must be nonempty",
		));
	}
	Ok(v)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum Iterable<T> {
	Atom(T),
	#[serde(deserialize_with = "de_nonempty_vec")]
	List(Vec<T>),
}

impl<'a, T> IntoIterator for &'a Iterable<T> {
	type Item = &'a T;
	type IntoIter = IterableIter<'a, T>;

	fn into_iter(self) -> Self::IntoIter {
		IterableIter::new(self)
	}
}

struct IterableIter<'a, T> {
	iterable: &'a Iterable<T>,
	index: usize,
}

impl<'a, T> IterableIter<'a, T> {
	fn new(iterable: &'a Iterable<T>) -> Self {
		Self { iterable, index: 0 }
	}
}

impl<'a, T> Iterator for IterableIter<'a, T> {
	type Item = &'a T;

	fn next(&mut self) -> Option<Self::Item> {
		let Self { iterable, index } = self;
		let next = match &*iterable {
			Iterable::Atom(x) => {
				if *index > 0 {
					return None;
				}
				x
			}
			Iterable::List(v) => {
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

#[allow(clippy::type_complexity)]
fn de_range<'de, D>(
	deserializer: D,
) -> Result<(i64, i64, Option<NonZeroI64>, Option<bool>), D::Error>
where
	D: Deserializer<'de>,
{
	#[derive(Deserialize)]
	struct Range {
		start: i64,
		end: i64,
		#[serde(default)]
		step: Option<i64>,
		#[serde(default)]
		closed: Option<bool>,
	}

	let Range {
		start,
		end,
		step,
		closed,
	} = Range::deserialize(deserializer)?;

	if step == Some(0) {
		return Err(<D::Error as serde::de::Error>::invalid_value(
			serde::de::Unexpected::Signed(0),
			&"step must not be 0",
		));
	}

	let step_nonopt = step.unwrap_or(if start < end { 1 } else { -1 });

	if (end > start) != (step_nonopt > 0) {
		return Err(<D::Error as serde::de::Error>::custom(format!(
			"must have either `start <= end && step > 0` or `start >= end && step < 0`, \
			 got start={}, end={}, step={}.",
			start, end, step_nonopt
		)));
	}

	let step = step.map(|s| NonZeroI64::new(s).unwrap());
	Ok((start, end, step, closed))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum Collection {
	// List must go first for untagged to treat a list as a List and not a Range
	List(Vec<VariableValue>),
	#[serde(deserialize_with = "de_range")]
	Range {
		start: i64,
		end: i64,
		#[serde(default)]
		step: Option<NonZeroI64>,
		#[serde(default)]
		closed: Option<bool>,
	},
}

enum ReifiedCollection<'a> {
	Range {
		start: i64,
		end: i64,
		step: NonZeroI64,
		closed: bool,
	},
	List(&'a [VariableValue]),
}

impl Collection {
	fn reified(&self) -> ReifiedCollection {
		match self {
			&Collection::Range {
				start,
				end,
				step,
				closed,
			} => ReifiedCollection::Range {
				start,
				end,
				step: step.unwrap_or(if start < end {
					NonZeroI64::new(1).unwrap()
				} else {
					NonZeroI64::new(-1).unwrap()
				}),
				closed: closed.unwrap_or(false),
			},
			Collection::List(v) => ReifiedCollection::List(v.as_ref()),
		}
	}
}

impl Collection {
	fn len(&self) -> usize {
		match self.reified() {
			ReifiedCollection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let step = step.get();
				let d_end = if closed { step } else { 0 };

				let len = (end + d_end - start) / step;
				assert!(len >= 0, "logic error: Collection::len() < 0");
				len as usize
			}
			ReifiedCollection::List(v) => v.len(),
		}
	}

	fn get(&self, index: usize) -> Option<VariableValue> {
		match self.reified() {
			ReifiedCollection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let index = index as i64;
				let step = step.get();
				let next = start + step * index;
				let out_of_bounds = match (step > 0, closed) {
					(true, true) => next > end,
					(true, false) => next >= end,
					(false, true) => next < end,
					(false, false) => next <= end,
				};

				if out_of_bounds {
					return None;
				}

				Some(ConcreteNumber::Int(next).into())
			}
			ReifiedCollection::List(v) => v.get(index).cloned(),
		}
	}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopVariable {
	#[serde(rename = "variable")]
	name: String,
	#[serde(rename = "in")]
	collection: Collection,
}

fn de_same_len_collections<'de, D>(deserializer: D) -> Result<Iterable<LoopVariable>, D::Error>
where
	D: Deserializer<'de>,
{
	let for_each_in = Iterable::<LoopVariable>::deserialize(deserializer)?;
	let mut iter = (&for_each_in).into_iter();
	let len = iter.next().unwrap().collection.len();

	for LoopVariable { collection, .. } in iter {
		if collection.len() != len {
			return Err(<D::Error as serde::de::Error>::custom(
				"when specifying multiple collections in a `for_each_in`, \
				 they must all have the same length",
			));
		}
	}

	Ok(for_each_in)
}

fn de_common_tag_fields<'de, D>(deserializer: D) -> Result<CommonTagFields<'static>, D::Error>
where
	D: Deserializer<'de>,
{
	let common_tag_fields = CommonTagFields::deserialize(deserializer)?;

	if common_tag_fields.children.is_some() {
		return Err(<D::Error as serde::de::Error>::custom(
			"`for_each_in` must not have any children",
		));
	}

	Ok(common_tag_fields)
}

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct ForeachTag<'a> {
	#[serde(deserialize_with = "de_same_len_collections")]
	for_each_in: Iterable<LoopVariable>,
	template: Box<AnyChildTag<'a>>,
	// the absence of children makes 'static appropriate here
	#[serde(flatten, deserialize_with = "de_common_tag_fields")]
	common_tag_fields: CommonTagFields<'static>,
	#[serde(skip)]
	children: LazyCell<Vec<AnyChildTag<'a>>>,
}

impl ForeachTag<'_> {
	fn loop_len(&self) -> usize {
		self.for_each_in
			.into_iter()
			.next()
			.unwrap()
			.collection
			.len()
	}
}

dispatch_to_common_tag_fields!(impl HasVars for ForeachTag<'_>);

impl<'a> ForeachTag<'a> {
	pub(crate) fn tag_name(&self) -> &'static str {
		"g"
	}

	pub(crate) fn base_attrs(&self) -> &XmlAttrs {
		self.common_tag_fields.base_attrs()
	}

	pub(crate) fn base_text(&self) -> &str {
		self.common_tag_fields.base_text()
	}

	pub(crate) fn should_escape_text(&self) -> bool {
		self.common_tag_fields.should_escape_text()
	}

	pub(crate) fn children(&'a self) -> ClgnDecodingResult<&'a [AnyChildTag<'a>]> {
		if let Some(children) = self.children.borrow() {
			return Ok(children.as_ref());
		}

		let mut children = Vec::new();
		for i in 0..self.loop_len() {
			let mut tag = *self.template.clone();

			for LoopVariable { name, collection } in &self.for_each_in {
				let elem = collection.get(i).unwrap();

				match &mut tag {
					AnyChildTag::Image(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Container(_) => {}
					AnyChildTag::NestedSvg(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Font(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Other(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
					AnyChildTag::Foreach(t) => {
						insert_var(t.base_vars_mut(), name.clone(), elem);
					}
				};
			}

			children.push(tag);
		}

		self.children.fill(children).unwrap();
		Ok(self.children.borrow().unwrap().as_ref())
	}
}
