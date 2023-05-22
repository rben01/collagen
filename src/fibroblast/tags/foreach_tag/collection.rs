use crate::{
	fibroblast::data_types::{ConcreteNumber, VariableValue},
	to_svg::svg_writable::ClgnDecodingError,
};
use serde::{Deserialize, Serialize};
use std::num::NonZeroI64;

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub(super) enum UnvalidatedCollection {
	// List must go first for untagged to treat a list as a List and not a Range
	List(Vec<VariableValue>),
	Range {
		start: i64,
		end: i64,
		#[serde(default)]
		step: Option<i64>,
		#[serde(default)]
		closed: Option<bool>,
	},
}

#[derive(Serialize, Debug, Clone)]
#[serde(untagged)]
pub(super) enum Collection {
	Range {
		start: i64,
		end: i64,
		#[serde(skip_serializing_if = "Option::is_none")]
		step: Option<NonZeroI64>,
		#[serde(skip_serializing_if = "Option::is_none")]
		closed: Option<bool>,
	},
	List(Vec<VariableValue>),
}

impl TryFrom<UnvalidatedCollection> for Collection {
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedCollection) -> Result<Self, Self::Error> {
		Ok(match value {
			UnvalidatedCollection::List(v) => Self::List(v),
			UnvalidatedCollection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let step = match step {
					// error conditions:
					// - step == 0 && end != start
					// - end > start && step < 0
					// - end < start && step > 0
					// - end == start && closed.unwrap_or(false)
					Some(step) => {
						if step == 0 && end != start {
							return Err(ClgnDecodingError::Foreach {
								msg: "step must not be 0 when start != end".into(),
							});
						}
						// step must point in the direction from start to end, with the
						// caveat that if end == start then step can be anything
						if (end > start) && (step < 0) || (end < start) || (step > 0) {
							return Err(ClgnDecodingError::Foreach {
								msg: format!(
									"if end != start, then must have either `start < end && step > 0` \
									 or `start > end && step < 0`; got start={}, end={}, step={}",
									start, end, step
								),
							});
						}
						if end == start && closed.unwrap_or(false) {
							return Err(ClgnDecodingError::Foreach {
								msg: format!(
									"start == end (== {}), but closed was false \
								    (or unspecified, which is equivalent to false), \
							       which would result in an empty range",
									start
								),
							});
						}
						Some(NonZeroI64::new(step).unwrap())
					}
					None => None,
				};

				Collection::Range {
					start,
					end,
					step,
					closed,
				}
			}
		})
	}
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

	pub(super) fn len(&self) -> usize {
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

	pub(super) fn get(&self, index: usize) -> Option<VariableValue> {
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
