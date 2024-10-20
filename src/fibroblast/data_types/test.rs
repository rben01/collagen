use super::*;
use crate::fibroblast::data_types::{Number, VariableValue as Vv};
use std::str::FromStr;

impl<'a> DecodingContext<'a> {
	pub(crate) fn new_empty() -> Self {
		Self::new(PathBuf::from_str("").unwrap(), Map::new())
	}

	pub(crate) fn new_with_vars<I: IntoIterator<Item = (&'a str, &'a VariableValue)>>(
		vars_intoiter: I,
	) -> Self {
		Self::new(PathBuf::from_str("").unwrap(), vars_intoiter)
	}

	pub(crate) fn vars_map(&self) -> Ref<Map<&str, &VariableValue>> {
		self.vars_map.borrow()
	}
}

fn missing_var(name: impl Into<String>) -> VariableEvaluationError {
	VariableEvaluationError::MissingVariable(name.into())
}

fn invalid_expr(expr: impl Into<String>) -> VariableEvaluationError {
	VariableEvaluationError::InvalidVariableNameOrExpression(expr.into())
}

fn invalid_esc(c: char) -> VariableEvaluationError {
	VariableEvaluationError::InvalidEscapedChar(c)
}

mod vars {
	use compact_str::CompactString;

	use super::*;
	use std::iter::FromIterator;

	#[test]
	fn empty() {
		let context = DecodingContext::new_empty();

		assert_eq!(context.vars_map().len(), 0);

		let v1 = context.get_var("");
		assert!(v1.is_none());

		let v2 = context.get_var("x");
		assert!(v2.is_none());
	}

	#[test]
	fn nonempty() {
		let xyz_ref = "xyz";
		let xyz_string = Vv::String(CompactString::const_new(xyz_ref));
		let context = DecodingContext::new_with_vars(vec![
			("a", &Vv::Number(Number(1.0))),
			("b", &Vv::Number(Number(2.0))),
			("c", &Vv::Number(Number(3.0))),
			("d", &xyz_string),
		]);

		assert_eq!(context.vars_map().len(), 4);

		assert_eq!(context.get_var("a"), Some(&Vv::Number(Number(1.0))));
		assert_eq!(context.get_var("b"), Some(&Vv::Number(Number(2.0))));
		assert_eq!(context.get_var("c"), Some(&Vv::Number(Number(3.0))));
		assert_eq!(
			context.get_var("d"),
			Some(&Vv::String(CompactString::const_new(xyz_ref)))
		);
	}

	#[test]
	fn with_new_vars() {
		let xyz_ref = "xyz";

		// Suffix `_n` denotes depth n of nested scopes
		let a_val_0 = Vv::Number(Number(1.0));
		let b_val_0 = Vv::Number(Number(2.0));
		let c_val_0 = Vv::String(CompactString::const_new(xyz_ref));
		let context =
			DecodingContext::new_with_vars(vec![("a", &a_val_0), ("b", &b_val_0), ("c", &c_val_0)]);

		let assert_unchanged_0 = || {
			assert_eq!(context.get_var("a"), Some(&a_val_0));
			assert_eq!(context.get_var("b"), Some(&b_val_0));
			assert_eq!(context.get_var("c"), Some(&c_val_0));
		};
		assert_unchanged_0();

		let empty_new_vars = TagVariables(Map::new());
		context
			.with_new_vars(&empty_new_vars, || {
				assert_eq!(context.get_var("a"), Some(&a_val_0));
				assert_eq!(context.get_var("b"), Some(&b_val_0));
				assert_eq!(context.get_var("c"), Some(&c_val_0));

				Ok(())
			})
			.unwrap();
		assert_unchanged_0();

		// For the sake of the discerning the outcome of the test, no two values should be equal
		let a_val_1 = Vv::Number(Number(3.0));
		let d_val_1 = Vv::String(CompactString::const_new("added_value"));
		let nonempty_new_vars = TagVariables(Map::from_iter(vec![
			(CompactString::const_new("a"), a_val_1.clone()),
			(CompactString::const_new("d"), d_val_1.clone()),
		]));
		context
			.with_new_vars(&nonempty_new_vars, || {
				assert_eq!(context.get_var("a"), Some(&a_val_1));
				assert_eq!(context.get_var("b"), Some(&b_val_0));
				assert_eq!(context.get_var("c"), Some(&c_val_0));
				assert_eq!(context.get_var("d"), Some(&d_val_1));

				Ok(())
			})
			.unwrap();
		assert_unchanged_0();

		// Test another level of nesting, repeated `with_new_vars` calls, etc
		context
			.with_new_vars(&nonempty_new_vars, || {
				let assert_unchanged_1 = || {
					assert_eq!(context.get_var("a"), Some(&a_val_1));
					assert_eq!(context.get_var("b"), Some(&b_val_0));
					assert_eq!(context.get_var("c"), Some(&c_val_0));
				};

				let a_val_2 = Vv::String(CompactString::const_new("this is a_val_3"));
				let c_val_2 = Vv::Number(Number(5.5));
				let nonempty_new_vars_2 = TagVariables(Map::from_iter(vec![
					(CompactString::const_new("a"), a_val_2.clone()),
					(CompactString::const_new("b"), b_val_0.clone()),
					(CompactString::const_new("c"), c_val_2.clone()),
				]));

				context
					.with_new_vars(&nonempty_new_vars_2, || {
						assert_eq!(context.get_var("a"), Some(&a_val_2));
						assert_eq!(context.get_var("b"), Some(&b_val_0));
						assert_eq!(context.get_var("c"), Some(&c_val_2));
						assert_eq!(context.get_var("d"), Some(&d_val_1));

						Ok(())
					})
					.unwrap();
				assert_unchanged_1();

				context
					.with_new_vars(&nonempty_new_vars_2, || {
						assert_eq!(context.get_var("a"), Some(&a_val_2));
						assert_eq!(context.get_var("b"), Some(&b_val_0));
						assert_eq!(context.get_var("c"), Some(&c_val_2));
						assert_eq!(context.get_var("d"), Some(&d_val_1));

						Ok(())
					})
					.unwrap();
				assert_unchanged_1();

				Ok(())
			})
			.unwrap();
		assert_unchanged_0();
	}
}

mod substitution {
	use super::*;
	use compact_str::CompactString;

	#[test]
	fn ok() {
		let empty_context = DecodingContext::new_empty();
		assert_eq!(empty_context.eval_exprs_in_str("").unwrap(), "");
		assert_eq!(empty_context.eval_exprs_in_str("xyz").unwrap(), "xyz");

		let xyz_ref = "xyz";
		let xyz_string = Vv::String(CompactString::const_new(xyz_ref));
		let nonempty_context = DecodingContext::new_with_vars([
			("a", &Vv::Number(Number(1.0))),
			("b", &Vv::Number(Number(2.0))),
			("c", &Vv::Number(Number(3.0))),
			("d", &Vv::Number(Number(4.5))),
			("e", &xyz_string),
		]);
		assert_eq!(nonempty_context.eval_exprs_in_str("").unwrap(), "");
		assert_eq!(nonempty_context.eval_exprs_in_str("xyz").unwrap(), "xyz");

		assert_eq!(nonempty_context.eval_exprs_in_str(" {a} ").unwrap(), " 1 ");

		// Something to note is that floats with 0 fractional part are written as if
		// they were ints, e.g., 10.0 becomes "10", not "10.0"
		assert_eq!(
			nonempty_context
				.eval_exprs_in_str("{a}; {b}; {c}; {d}; {e}")
				.unwrap(),
			"1; 2; 3; 4.5; xyz"
		);

		// Backslashes
		assert_eq!(empty_context.eval_exprs_in_str(r"\\").unwrap(), r"\");
		assert_eq!(empty_context.eval_exprs_in_str(r"\{").unwrap(), r"{");
		assert_eq!(empty_context.eval_exprs_in_str(r"\}").unwrap(), r"}");
		assert_eq!(empty_context.eval_exprs_in_str(r"\\\{").unwrap(), r"\{");
		assert_eq!(empty_context.eval_exprs_in_str(r"\\\}").unwrap(), r"\}");
		assert_eq!(empty_context.eval_exprs_in_str(r"\{\}").unwrap(), r"{}");
		assert_eq!(empty_context.eval_exprs_in_str(r"\\\\").unwrap(), r"\\");
		assert_eq!(
			empty_context.eval_exprs_in_str(r"\\\\\{\\\\\\").unwrap(),
			r"\\{\\\"
		);

		// Math
		assert_eq!(
			nonempty_context.eval_exprs_in_str("{(+ a b)}").unwrap(),
			"3"
		);
		assert_eq!(
			nonempty_context
				.eval_exprs_in_str("{(+ a b)} { ( / (   +   d   a   a   a ) c ) }")
				.unwrap(),
			"3 2.5"
		);
		assert_eq!(
			nonempty_context
				.eval_exprs_in_str("{(max a b c d)}")
				.unwrap(),
			nonempty_context.eval_exprs_in_str("{d}").unwrap()
		);
		assert_eq!(
			nonempty_context
				.eval_exprs_in_str("{(min a b c d)}")
				.unwrap(),
			nonempty_context.eval_exprs_in_str("{a}").unwrap()
		);
		assert!(
			(nonempty_context
				.eval_exprs_in_str("{(pi)}")
				.unwrap()
				.parse::<f64>()
				.unwrap() - std::f64::consts::PI)
				.abs() < 1e-10
		);
		assert!(
			(nonempty_context
				.eval_exprs_in_str("{(e)}")
				.unwrap()
				.parse::<f64>()
				.unwrap() - std::f64::consts::E)
				.abs() < 1e-10
		);
		assert_eq!(
			nonempty_context
				.eval_exprs_in_str("abc {(/(*(tan(atan2(pi)(exp 2)))(pow (e) 2))2)} xyz")
				.unwrap(),
			"abc 1.5707963267948963 xyz" // pi/2 to within FP error
		);
	}

	#[allow(clippy::too_many_lines)]
	#[test]
	fn parse_errors() {
		use super::{VariableEvaluationError, VariableValue as Vv};

		#[track_caller]
		fn test<V>(context: &DecodingContext, s: &str, err: V)
		where
			V: Into<Vec<VariableEvaluationError>>,
		{
			assert_eq!(
				context.eval_exprs_in_str(s).unwrap_err(),
				err.into().into_iter().collect::<Vec<_>>()
			);
		}

		let empty_context = DecodingContext::new_empty();

		let vars = [
			("a", Vv::Number(Number(1.0))),
			("b", Vv::Number(Number(2.0))),
			("c", Vv::String(CompactString::const_new("abc"))),
			("d", Vv::String(CompactString::const_new(r"\"))),
			("e", Vv::String(CompactString::const_new(r"\{}"))),
		];
		let nonempty_context = DecodingContext::new_with_vars(vars.iter().map(|(k, v)| (*k, v)));

		test(
			&empty_context,
			r"\",
			[VariableEvaluationError::TrailingBackslash],
		);
		test(
			&empty_context,
			r"x\",
			[VariableEvaluationError::TrailingBackslash],
		);
		test(
			&empty_context,
			r"xytas\{\}\",
			[VariableEvaluationError::TrailingBackslash],
		);
		test(
			&nonempty_context,
			r"xytas{c}\",
			[VariableEvaluationError::TrailingBackslash],
		);
		test(
			&nonempty_context,
			r"xytas{xy}\",
			[
				VariableEvaluationError::MissingVariable("xy".into()),
				VariableEvaluationError::TrailingBackslash,
			],
		);
		test(
			&nonempty_context,
			r"xytas{d}\",
			// two tailing backslashes because d is itself a trailing backslash
			[
				VariableEvaluationError::TrailingBackslash,
				VariableEvaluationError::TrailingBackslash,
			],
		);
		test(
			&nonempty_context,
			r"\xytas{a}\\{e}\",
			[
				invalid_esc('x'),
				// Because e is a bad backslash
				VariableEvaluationError::UnmatchedRightBrace,
				VariableEvaluationError::TrailingBackslash,
			],
		);

		test(
			&empty_context,
			"{",
			[VariableEvaluationError::UnmatchedLeftBrace],
		);
		test(
			&empty_context,
			"{xyz",
			[VariableEvaluationError::UnmatchedLeftBrace],
		);
		test(
			&empty_context,
			"}",
			[VariableEvaluationError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"xyz}",
			[VariableEvaluationError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"{xyz}{",
			[
				missing_var("xyz"),
				VariableEvaluationError::UnmatchedLeftBrace,
			],
		);
		test(
			&empty_context,
			"{xyz}}",
			[
				missing_var("xyz"),
				VariableEvaluationError::UnmatchedRightBrace,
			],
		);
		test(
			&nonempty_context,
			"{a}{b}}",
			[VariableEvaluationError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"{xyz}6789}ajshd",
			[
				missing_var("xyz"),
				VariableEvaluationError::UnmatchedRightBrace,
			],
		);

		test(
			&empty_context,
			r"ak{jh}sd{js",
			[
				missing_var("jh"),
				VariableEvaluationError::UnmatchedLeftBrace,
			],
		);

		test(
			&empty_context,
			r"ak{\jh}sd{js",
			[
				invalid_expr("\\jh"),
				VariableEvaluationError::UnmatchedLeftBrace,
			],
		);
		test(
			&empty_context,
			r"ak{xyjh}sd{\Ks",
			[
				missing_var("xyjh"),
				VariableEvaluationError::UnmatchedLeftBrace,
				VariableEvaluationError::InvalidEscapedChar('K'),
			],
		);

		test(&empty_context, r"\{\x", [invalid_esc('x')]);
		test(&empty_context, r"\\x\|", [invalid_esc('|')]);
	}

	#[test]
	fn missing_vars() {
		#[track_caller]
		fn test<'a>(
			context: &DecodingContext,
			input: impl AsRef<str>,
			missing: impl Into<Vec<&'a str>>,
		) {
			assert_eq!(
				context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
				missing
					.into()
					.into_iter()
					.map(|s| VariableEvaluationError::MissingVariable(s.into()))
					.collect::<Vec<_>>()
			);
		}

		let empty_context = DecodingContext::new_empty();

		test(&empty_context, "{missing_var}", ["missing_var"]);
		test(&empty_context, "{mv1} {mv2}", ["mv1", "mv2"]);
		test(&empty_context, "a {mv1} b {mv2} c", ["mv1", "mv2"]);

		let xyz_ref = "xyz";
		let xyz_string = Vv::String(CompactString::const_new(xyz_ref));
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &Vv::Number(Number(1.0))),
			("b", &xyz_string),
		]);

		test(&nonempty_context, "{mv1} {mv2}", ["mv1", "mv2"]);
		test(&nonempty_context, "{a} {mv2}", ["mv2"]);
		test(
			&nonempty_context,
			"{a} {mv2} {mv2} {mv2}",
			["mv2", "mv2", "mv2"],
		);
		test(&nonempty_context, "{a} {b} {mv1} {mv2}", ["mv1", "mv2"]);
		test(
			&nonempty_context,
			"{a} {mv1} {mv1} {mv2} {mv1} {mv2} {mv2} {b} ",
			["mv1", "mv1", "mv2", "mv1", "mv2", "mv2"],
		);

		// Not actually missing any
		assert!(nonempty_context.eval_exprs_in_str("{a} {b}").is_ok());
	}

	#[test]
	fn invalid_exprs() {
		#[track_caller]
		fn test<'a>(
			context: &DecodingContext,
			input: impl AsRef<str>,
			invalid: impl Into<Vec<&'a str>>,
		) {
			assert_eq!(
				context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
				invalid
					.into()
					.into_iter()
					.map(|s| VariableEvaluationError::InvalidVariableNameOrExpression(s.into()))
					.collect::<Vec<_>>()
			);
		}

		let empty_context = DecodingContext::new_empty();

		test(&empty_context, "{}", [""]);
		test(&empty_context, "{ }", [" "]);
		test(&empty_context, "{\n}", ["\n"]);
		test(&empty_context, "{a.}", ["a."]);
		test(&empty_context, "{ .}", [" ."]);

		test(&empty_context, "{} {}", ["", ""]);
		test(&empty_context, "{ } {}", [" ", ""]);
		test(&empty_context, "{} { }", ["", " "]);
		test(&empty_context, "{ } { }", [" ", " "]);
		test(&empty_context, "{} { } {  } {}", ["", " ", "  ", ""]);
	}

	#[test]
	fn illegal_and_missing_var_names() {
		#[track_caller]
		fn test(
			context: &DecodingContext,
			input: impl AsRef<str>,
			vars: impl Into<Vec<VariableEvaluationError>>,
		) {
			assert_eq!(
				context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
				vars.into()
			);
		}

		let empty_context = DecodingContext::new_empty();

		test(
			&empty_context,
			"{} {a}",
			[invalid_expr(""), missing_var("a")],
		);

		test(
			&empty_context,
			"{} {a} {} {a}",
			[
				invalid_expr(""),
				missing_var("a"),
				invalid_expr(""),
				missing_var("a"),
			],
		);

		test(
			&empty_context,
			"{} {a} { } {    } {b}",
			[
				invalid_expr(""),
				missing_var("a"),
				invalid_expr(" "),
				invalid_expr("    "),
				missing_var("b"),
			],
		);

		test(
			&empty_context,
			"{} { a } { } { b }",
			[
				invalid_expr(""),
				missing_var("a"),
				invalid_expr(" "),
				missing_var("b"),
			],
		);

		test(
			&empty_context,
			"{a} {b} {c} {d}",
			[
				missing_var("a"),
				missing_var("b"),
				missing_var("c"),
				missing_var("d"),
			],
		);

		let xyz_ref = "xyz";
		let xyz_string = Vv::String(CompactString::const_new(xyz_ref));
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &Vv::Number(Number(1.0))),
			("b", &Vv::Number(Number(2.0))),
			("c", &Vv::Number(Number(3.0))),
			("d", &xyz_string),
		]);

		test(
			&nonempty_context,
			"{} {a} {} {a}",
			[invalid_expr(""), invalid_expr("")],
		);

		test(
			&nonempty_context,
			"{} {a} { } {e}",
			[invalid_expr(""), invalid_expr(" "), missing_var("e")],
		);

		test(
			&nonempty_context,
			"{} { a } { } { b }",
			[invalid_expr(""), invalid_expr(" ")],
		);

		test(
			&nonempty_context,
			"{a} {b} { c } { d } {e}",
			[missing_var("e")],
		);

		assert!(nonempty_context
			.eval_exprs_in_str("{a} {b} {c} {d}")
			.is_ok());
	}
}
