use crate::{
	fibroblast::{
		data_types::{ConcreteNumber, VariableValue},
		DecodingContext,
	},
	parsing::errors::VariableEvaluationError,
	to_svg::svg_writable::ClgnDecodingError,
	ClgnDecodingResult,
};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

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
		fn evaluate(
			name: &str,
			x: &VariableValue,
			context: &DecodingContext,
		) -> ClgnDecodingResult<f64> {
			Ok(match x {
				VariableValue::Number(n) => (*n).into(),
				VariableValue::String(s) => {
					context.eval_exprs_in_str(s)?.parse().map_err(|_| {
						ClgnDecodingError::Parsing(vec![
							VariableEvaluationError::ExpectedNumGotString {
								variable: name.to_string(),
								value: s.to_string(),
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
				let start = evaluate("start", start, context)?;
				let end = evaluate("end", end, context)?;
				let step = step
					.as_ref()
					.map(|step| evaluate("step", step, context))
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
							VariableValue::Number(n) => VariableValue::Number(*n),
							VariableValue::String(s) => {
								VariableValue::String(context.eval_exprs_in_str(s.as_str())?.into())
							}
						})
					})
					.collect::<ClgnDecodingResult<Vec<_>>>()?,
			),
		})
	}
}

impl LoopCollection {
	#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
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

	#[allow(clippy::cast_precision_loss)]
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
