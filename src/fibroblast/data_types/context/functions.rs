use strum_macros::{AsRefStr, EnumString, IntoStaticStr};

#[derive(Debug)]
#[cfg_attr(test, derive(Eq, PartialEq))]
#[allow(dead_code)]
pub struct ArityError {
	func: &'static str,
	arity: usize,
	n_args_received: usize,
}

pub(super) enum FunctionCallError<E> {
	Arity(ArityError),
	Other(E),
}

impl<E> From<ArityError> for FunctionCallError<E> {
	fn from(value: ArityError) -> Self {
		Self::Arity(value)
	}
}

pub(super) type FunctionCallResult<T, E> = Result<T, FunctionCallError<E>>;

trait FixedArityFunction: Into<&'static str> {
	const ARITY: usize;

	fn validate_n_args<I: ExactSizeIterator>(self, args: &I) -> Result<(), ArityError>
	where
		Self: Sized + Copy,
	{
		let n_args = args.len();
		if n_args != Self::ARITY {
			return Err(ArityError {
				func: self.into(),
				arity: Self::ARITY,
				n_args_received: n_args,
			});
		}
		Ok(())
	}

	// needs #![featuer(generic_cont_exprs)]
	// fn try_collect_args<E>(
	// 	&self,
	// 	args: impl IntoIterator<Item = Result<f64, E>> + ExactSizeIterator,
	// ) -> FunctionCallResult<[f64; Self::N_ARGS], E>
	// where
	// 	Self: Sized,
	// {
	// 	self.validate_n_args(&args)?;
	// 	let mut args_arr = [0.0; Self::N_ARGS];
	// 	for (i, arg) in args.into_iter().enumerate() {
	// 		args_arr[i] = arg.map_err(FunctionCallError::Other)?;
	// 	}
	// 	Ok(args_arr)
	// }
}

macro_rules! impl_fixed_arity {
	($N:literal) => {
		fn try_collect_args<E>(
			&self,
			args: impl IntoIterator<Item = Result<f64, E>> + ExactSizeIterator,
		) -> FunctionCallResult<[f64; $N], E>
		where
			Self: Sized + Copy,
		{
			self.validate_n_args(&args)?;
			let mut args_arr = [0.0; $N];
			for (i, arg) in args.into_iter().enumerate() {
				args_arr[i] = arg.map_err(FunctionCallError::Other)?;
			}
			Ok(args_arr)
		}

		pub(super) fn try_call<I, E>(&self, args: I) -> FunctionCallResult<f64, E>
		where
			I: IntoIterator<Item = Result<f64, E>> + ExactSizeIterator,
		{
			Ok(self.call(self.try_collect_args(args)?))
		}
	};
}

#[derive(Copy, Clone, Debug, EnumString, AsRefStr)]
#[strum(serialize_all = "lowercase")]
pub(super) enum VariadicFunction {
	#[strum(serialize = "+")]
	Add,
	#[strum(serialize = "*")]
	Mul,
	Max,
	Min,
	And,
	Or,
}

impl VariadicFunction {
	fn init(&self) -> f64 {
		use VariadicFunction::*;
		match self {
			Add | Or => 0.0,
			Mul | And => 1.0,
			Max => f64::MIN,
			Min => f64::MAX,
		}
	}

	fn apply(&self, x: f64, y: f64) -> f64 {
		use VariadicFunction::*;
		match self {
			Add => x + y,
			Mul => x * y,
			Max => x.max(y),
			Min => x.min(y),
			And => x.min(f64::from(y != 0.0)),
			Or => x.max(f64::from(y != 0.0)),
		}
	}

	pub(super) fn try_call<E>(
		self,
		args: impl IntoIterator<Item = Result<f64, E>>,
	) -> FunctionCallResult<f64, E> {
		let mut acc = self.init();
		for arg in args {
			acc = self.apply(acc, arg.map_err(FunctionCallError::Other)?);
		}
		Ok(acc)
	}
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "lowercase")]
pub(super) enum TernaryFunction {
	#[strum(serialize = "if")]
	IfElse,
}

impl FixedArityFunction for TernaryFunction {
	const ARITY: usize = 3;
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

	impl_fixed_arity!(3);
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "lowercase")]
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

impl FixedArityFunction for BinaryFunction {
	const ARITY: usize = 2;
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

	impl_fixed_arity!(2);
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "lowercase")]
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

impl FixedArityFunction for UnaryFunction {
	const ARITY: usize = 1;
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

	impl_fixed_arity!(1);
}

#[derive(Copy, Clone, Debug, EnumString, IntoStaticStr)]
#[strum(serialize_all = "lowercase", ascii_case_insensitive)]
pub(super) enum NullaryFunction {
	E,
	Pi,
	Nan,
}

impl FixedArityFunction for NullaryFunction {
	const ARITY: usize = 0;
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

	impl_fixed_arity!(0);
}
