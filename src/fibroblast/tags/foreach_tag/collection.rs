use std::borrow::Cow;

use crate::{
	fibroblast::{
		data_types::{context::errors::VariableSubstitutionError, ConcreteNumber, VariableValue},
		DecodingContext,
	},
	to_svg::svg_writable::ClgnDecodingError,
	ClgnDecodingResult,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum UnprocessedLoopCollection {
	Range {
		start: VariableValue,
		end: VariableValue,
		#[serde(default, skip_serializing_if = "Option::is_none")]
		step: Option<VariableValue>,
		#[serde(default, skip_serializing_if = "Option::is_none")]
		closed: Option<bool>,
	},
	List(Vec<VariableValue>),
}

#[derive(Debug, Default, Clone, Copy, Serialize)]
pub(crate) struct ReifiedRange {
	start: f64,
	end: f64,
	step: f64,
	closed: bool,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum LoopCollection {
	Range(ReifiedRange),
	List(Vec<VariableValue>),
}

impl UnprocessedLoopCollection {
	pub(super) fn reified(&self, context: &DecodingContext) -> ClgnDecodingResult<LoopCollection> {
		fn get_endpoint(x: &VariableValue, context: &DecodingContext) -> ClgnDecodingResult<f64> {
			Ok(match x {
				VariableValue::Number(n) => (*n).into(),
				VariableValue::String(s) => {
					context.eval_exprs_in_str(s)?.parse().map_err(|_| {
						ClgnDecodingError::Parsing(vec![
							VariableSubstitutionError::ExpectedNumGotString {
								variable: "start".to_owned(),
								value: s.clone(),
							},
						])
					})?
				}
			})
		}

		Ok(match self {
			UnprocessedLoopCollection::Range {
				start,
				end,
				step,
				closed,
			} => {
				let start = get_endpoint(start, context)?;
				let end = get_endpoint(end, context)?;
				let step = step
					.as_ref()
					.map(|step| get_endpoint(step, context))
					.transpose()?
					.unwrap_or(if start < end { 1.0 } else { -1.0 });

				LoopCollection::Range(ReifiedRange {
					start,
					end,
					step,
					closed: closed.unwrap_or(false),
				})
			}
			UnprocessedLoopCollection::List(list) => LoopCollection::List(
				list.iter()
					.map(|v| {
						Ok(match v {
							VariableValue::Number(_) => v.clone(),
							VariableValue::String(s) => {
								context.eval_exprs_in_str(s)?.into_owned().into()
							}
						})
					})
					.collect::<ClgnDecodingResult<Vec<_>>>()?,
			),
		})
	}
}

impl LoopCollection {
	pub(super) fn len(&self) -> usize {
		match self {
			&Self::Range(ReifiedRange {
				start,
				end,
				step,
				closed,
			}) => {
				let d_end = if closed { step } else { 0.0 };

				let len = ((end + d_end - start) / step).floor();
				assert!(len >= 0.0, "logic error: Collection::len() < 0");
				len as usize
			}
			Self::List(v) => v.len(),
		}
	}

	pub(super) fn get(&self, index: usize) -> Option<Cow<VariableValue>> {
		match self {
			&Self::Range(ReifiedRange {
				start,
				end,
				step,
				closed,
			}) => {
				let index = index as f64;
				let next = start + step * index;
				let out_of_bounds = match (step > 0.0, closed) {
					(true, true) => next > end,
					(true, false) => next >= end,
					(false, true) => next < end,
					(false, false) => next <= end,
				};

				if out_of_bounds {
					return None;
				}

				Some(Cow::Owned(ConcreteNumber::Float(next).into()))
			}
			Self::List(v) => v.get(index).map(Cow::Borrowed),
		}
	}
}
