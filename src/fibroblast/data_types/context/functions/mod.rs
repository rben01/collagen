mod function_impls;
mod nullary_to_num;
mod variadic_num_to_num;

use std::fmt::{self, Write};
use strum_macros::{EnumString, IntoStaticStr};

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum Arity {
	Exactly(usize),
	Between(usize, usize),
	AtLeast(usize),
	AtMost(usize),
}

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub enum FunctionCallSiteError {
	Arity {
		func: &'static str,
		expected: Arity,
		actual: Arity,
	},
	ArgumentType {
		func: &'static str,
		position: usize,
		expected: FunctionDatumType,
		actual: FunctionDatumType,
	},
}

pub(super) enum FunctionCallError<E> {
	CallSite(FunctionCallSiteError),
	Upstream(E),
}

impl<E> From<FunctionCallSiteError> for FunctionCallError<E> {
	fn from(err: FunctionCallSiteError) -> Self {
		Self::CallSite(err)
	}
}

type FunctionCallResult<T, E> = Result<T, FunctionCallError<E>>;

// TODO: replace Result<T, E> with Result<!, E> when stabilized
// (and remove generic T altogether)
// never_type https://github.com/rust-lang/rust/issues/35121
fn arity_error<T, Me: Into<&'static str>, E>(
	me: Me,
	expected: Arity,
	actual: Arity,
) -> FunctionCallResult<T, E> {
	return Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
		func: me.into(),
		expected,
		actual,
	}));
}

fn lift_errors<I, E>(it: I) -> impl Iterator<Item = FunctionCallResult<FunctionDatum, E>>
where
	I: IntoIterator<Item = Result<FunctionDatum, E>>,
{
	it.into_iter()
		.map(|x| x.map_err(FunctionCallError::Upstream))
}

pub enum FunctionDatum {
	Number(f64),
	Text(String),
}

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
enum FunctionDatumType {
	Number,
	Text,
	List,
	Iterable,
}

impl fmt::Display for FunctionDatum {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		use FunctionDatum::*;
		match self {
			Number(x) => write!(f, "{}", x),
			Text(s) => f.write_str(s),
		}
	}
}

trait FallibleFunction {
	type Output;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>;
}

impl<E> From<FunctionDatum> for FunctionCallResult<FunctionDatum, E> {
	fn from(value: FunctionDatum) -> Self {
		Ok(value)
	}
}

fn ensure_number<T, D, E>(func: T, val: D, idx: usize) -> FunctionCallResult<f64, E>
where
	T: Into<&'static str>,
	D: Into<FunctionCallResult<FunctionDatum, E>>,
{
	let val = val.into()?;
	Ok(match val {
		FunctionDatum::Number(x) => x,
		FunctionDatum::Text(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: func.into(),
					position: idx,
					expected: FunctionDatumType::Number,
					actual: FunctionDatumType::Text,
				},
			))
		}
	})
}

fn ensure_string<T, D, E>(func: T, val: D, idx: usize) -> FunctionCallResult<String, E>
where
	T: Into<&'static str>,
	D: Into<FunctionCallResult<FunctionDatum, E>>,
{
	let val = val.into()?;
	Ok(match val {
		FunctionDatum::Text(s) => s,
		FunctionDatum::Number(_) => {
			return Err(FunctionCallError::CallSite(
				FunctionCallSiteError::ArgumentType {
					func: func.into(),
					position: idx,
					expected: FunctionDatumType::Text,
					actual: FunctionDatumType::Number,
				},
			))
		}
	})
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum VariadicNum2NumFunction {
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,
}

impl FallibleFunction for VariadicNum2NumFunction {
	type Output = f64;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		use VariadicNum2NumFunction::*;

		let mut args = lift_errors(args).enumerate();

		let Some((idx, acc)) = args.next() else {
			return arity_error(self, Arity::AtLeast(1), Arity::Exactly(0));
		};

		let mut acc = ensure_number(self, acc?, idx)?;

		for (idx, x) in args {
			let x = ensure_number(self, x, idx)?;
			match self {
				Add => acc += x,
				Mul => acc *= x,
				Max => acc = acc.max(x),
				Min => acc = acc.min(x),
				And => acc = f64::from((acc != 0.0) && (x != 0.0)),
				Or => acc = f64::from((acc != 0.0) || (x != 0.0)),
			}
		}

		Ok(acc)
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
pub(super) enum UnaryOrBinaryNum2numFunction {
	#[strum(serialize = "-")]
	Sub,
}

impl FallibleFunction for UnaryOrBinaryNum2numFunction {
	type Output = f64;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		let arity = Arity::Between(1, 2);
		let mut args = lift_errors(args).enumerate();

		let a = match args.next() {
			Some((idx, a)) => ensure_number(self, a, idx)?,
			None => return arity_error(self, arity, Arity::Exactly(0)),
		};

		let ans = match args.next() {
			Some((idx, b)) => {
				let b = ensure_number(self, b, idx)?;
				if let Some((idx, _)) = args.next() {
					return arity_error(self, arity, Arity::AtLeast(idx));
				}
				a - b
			}
			None => -a,
		};

		Ok(ans)
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum UnaryString2StringFunction {
	ToUpper,
	ToLower,
	Trim,
	TrimStart,
	TrimEnd,
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum UnaryCollection2NumFunction {
	Len,
	IsEmpty,
}

impl FallibleFunction for UnaryCollection2NumFunction {
	type Output = f64;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		use UnaryCollection2NumFunction::*;

		let mut args = lift_errors(args);
		let l = match args.next().transpose()? {
			Some(l) => l,
			None => return arity_error(self, Arity::Exactly(1), Arity::Exactly(0)),
		};

		let len = match l {
			FunctionDatum::Number(_) => {
				return Err(FunctionCallError::CallSite(
					FunctionCallSiteError::ArgumentType {
						func: self.into(),
						position: 0,
						expected: FunctionDatumType::Iterable,
						actual: FunctionDatumType::Number,
					},
				))
			}
			FunctionDatum::Text(s) => s.len(),
		};

		Ok(match self {
			Len => len as f64,
			IsEmpty => f64::from(len != 0),
		})
	}
}

impl FallibleFunction for UnaryString2StringFunction {
	// Change to a Cow? Would need to borrow from the input then... would require not
	// consuming the iterator?
	type Output = String;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		use UnaryString2StringFunction::*;

		let mut args = lift_errors(args);

		let s = match args.next().transpose()? {
			Some(s) => s,
			None => {
				return Err(FunctionCallError::CallSite(FunctionCallSiteError::Arity {
					func: self.into(),
					expected: Arity::Exactly(1),
					actual: Arity::Exactly(0),
				}))
			}
		};
		let s = ensure_string(self, s, 0)?;

		Ok(match self {
			ToUpper => s.to_uppercase(),
			ToLower => s.to_lowercase(),
			Trim => s.trim().to_owned(),
			TrimStart => s.trim_start().to_owned(),
			TrimEnd => s.trim_end().to_owned(),
		})
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum VariadicStringish2StringFunction {
	Concat,
	Join,
}

impl FallibleFunction for VariadicStringish2StringFunction {
	type Output = String;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		use VariadicStringish2StringFunction::*;

		let mut buf = String::new();
		let args = lift_errors(args);

		match self {
			Concat => {
				let Some(first) = args.next().transpose()? else {
					return arity_error(self, Arity::AtLeast(1), Arity::Exactly(0));
				};

				write!(buf, "{first}").unwrap();
				for arg in args {
					let arg = arg?;
					write!(buf, "{arg}").unwrap();
				}
			}
			Join => {
				let arity = Arity::AtLeast(2);
				let Some(sep) = args.next().transpose()? else {
					return arity_error(self, arity, Arity::Exactly(0));
				};
				let Some(first) = args.next().transpose()? else {
					return arity_error(self, arity, Arity::Exactly(1));
				};

				write!(buf, "{first}").unwrap();
				for arg in args {
					let arg = arg?;
					write!(buf, "{sep}{arg}").unwrap();
				}
			}
		};

		Ok(buf)
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum TernaryFunction {
	#[strum(serialize = "if")]
	IfElse,
}

impl FallibleFunction for TernaryFunction {
	type Output = f64;

	fn try_call<I, E>(&self, args: I) -> FunctionCallResult<Self::Output, E>
	where
		I: IntoIterator<Item = Result<FunctionDatum, E>>,
	{
		todo!()
	}
}

impl TernaryFunction {
	fn call(&self, args: [f64; 3]) -> f64 {
		use TernaryFunction::*;

		let [x1, x2, x3] = args;
		match self {
			IfElse => {
				if x1 != 0.0 {
					x2
				} else {
					x3
				}
			}
		}
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum BinaryFunction {
	#[strum(serialize = "-")]
	Sub,
	#[strum(serialize = "/")]
	Div,
	#[strum(serialize = "%")]
	Mod,
	Pow,
	Atan2,
	#[strum(serialize = "<")]
	Lt,
	#[strum(serialize = "<=")]
	Le,
	#[strum(serialize = "=")]
	Eq,
	#[strum(serialize = ">")]
	Gt,
	#[strum(serialize = ">=")]
	Ge,
}

impl BinaryFunction {
	fn call(&self, args: [f64; 2]) -> f64 {
		use BinaryFunction::*;
		let [x, y] = args;
		match self {
			Sub => x - y,
			Div => x / y,
			Mod => x % y,
			Pow => x.powf(y),
			// a tad confusing; the first argument is the "y" of atan2, the second is
			// the "x"; a.atan2(b) is atan2(b, a), and so these arguments are in the
			// correct order
			Atan2 => x.atan2(y),
			Lt => (x < y).into(),
			Le => (x <= y).into(),
			Eq => (x == y).into(),
			Gt => (x > y).into(),
			Ge => (x >= y).into(),
		}
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum UnaryFunction {
	Exp,
	Log,
	Log2,
	Sin,
	Cos,
	Tan,
	Asin,
	Acos,
	Atan,
}

impl UnaryFunction {
	pub(super) fn call(&self, args: [f64; 1]) -> f64 {
		use UnaryFunction::*;
		let [x] = args;
		match self {
			Exp => x.exp(),
			Log => x.ln(),
			Log2 => x.log2(),
			Sin => x.sin(),
			Cos => x.cos(),
			Tan => x.tan(),
			Asin => x.asin(),
			Acos => x.acos(),
			Atan => x.atan(),
		}
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case", ascii_case_insensitive)]
pub(super) enum NullaryFunction {
	E,
	Pi,
	Nan,
}

impl NullaryFunction {
	fn call(&self, _args: [f64; 0]) -> f64 {
		use NullaryFunction::*;
		match self {
			E => std::f64::consts::E,
			Pi => std::f64::consts::PI,
			Nan => std::f64::NAN,
		}
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "kebab-case")]
pub(super) enum Function {
	// Nullary (constant) () -> num functions
	E,
	Pi,
	Nan,
	Inf,

	// Unary num -> num functions
	Exp,
	Log,
	Log2,
	Sin,
	Cos,
	Tan,
	Asin,
	Acos,
	Atan,

	// Variadic num -> num functions
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,

	// Unary or binary num -> num functions
	#[strum(serialize = "-")]
	Sub,

	// Binary num -> num functions
	#[strum(serialize = "/")]
	Div,
	#[strum(serialize = "%")]
	Mod,
	Pow,
	Atan2,
	#[strum(serialize = "<")]
	Lt,
	#[strum(serialize = "<=")]
	Le,
	#[strum(serialize = "=")]
	Eq,
	#[strum(serialize = ">")]
	Gt,
	#[strum(serialize = ">=")]
	Ge,

	// Unary string -> string functions
	ToUpper,
	ToLower,
	Trim,
	TrimStart,
	TrimEnd,

	// Unary collection -> num functions
	Len,
	IsEmpty,
}
