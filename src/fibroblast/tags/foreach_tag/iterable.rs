use crate::{to_svg::svg_writable::ClgnDecodingError, ClgnDecodingResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub(super) enum UnvalidatedIterable<T> {
	Atom(T),
	List(Vec<T>),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum Iterable<T> {
	Atom(T),
	List(Vec<T>),
}

impl<T, U> TryFrom<UnvalidatedIterable<U>> for Iterable<T>
where
	U: TryInto<T, Error = ClgnDecodingError>,
{
	type Error = ClgnDecodingError;

	fn try_from(value: UnvalidatedIterable<U>) -> Result<Self, Self::Error> {
		Ok(match value {
			UnvalidatedIterable::Atom(x) => Self::Atom(x.try_into()?),
			UnvalidatedIterable::List(v) => {
				if v.is_empty() {
					return Err(ClgnDecodingError::Foreach {
						msg: "the list of variables to loop over in a `for_each` must be nonempty"
							.into(),
					});
				}
				Self::List(
					v.into_iter()
						.map(|x| x.try_into())
						.collect::<ClgnDecodingResult<Vec<_>>>()?,
				)
			}
		})
	}
}

impl<'a, T> IntoIterator for &'a Iterable<T> {
	type Item = &'a T;
	type IntoIter = IterableIter<'a, T>;

	fn into_iter(self) -> Self::IntoIter {
		IterableIter::new(self)
	}
}

pub struct IterableIter<'a, T> {
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
