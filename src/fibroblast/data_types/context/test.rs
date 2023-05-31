use super::*;
use crate::fibroblast::data_types::{ConcreteNumber as CN, VariableValue as VV};
use std::{path::Path, str::FromStr};

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

fn missing_var(name: impl Into<String>) -> VariableSubstitutionError {
	VariableSubstitutionError::MissingVariable(name.into())
}

fn invalid_expr(expr: impl Into<String>) -> VariableSubstitutionError {
	VariableSubstitutionError::InvalidVariableNameOrExpression(expr.into())
}

fn invalid_esc(c: char) -> VariableSubstitutionError {
	VariableSubstitutionError::InvalidEscapedChar(c)
}

mod vars {
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
		let xyz_string = VV::String(xyz_ref.to_string());
		let context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &VV::Number(CN::UInt(2))),
			("c", &VV::Number(CN::Float(3.0))),
			("d", &xyz_string),
		]);

		assert_eq!(context.vars_map().len(), 4);

		assert_eq!(context.get_var("a"), Some(&VV::Number(CN::Int(1))));
		assert_eq!(context.get_var("b"), Some(&VV::Number(CN::UInt(2))));
		assert_eq!(context.get_var("c"), Some(&VV::Number(CN::Float(3.0))));
		assert_eq!(context.get_var("d"), Some(&VV::String(xyz_ref.to_string())));
	}

	#[test]
	fn with_new_vars() {
		let xyz_ref = "xyz";

		// Suffix `_n` denotes depth n of nested scopes
		let a_val_0 = VV::Number(CN::Int(1));
		let b_val_0 = VV::Number(CN::UInt(2));
		let c_val_0 = VV::String(xyz_ref.to_string());
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
		let a_val_1 = VV::Number(CN::UInt(3));
		let d_val_1 = VV::String("added_value".to_string());
		let nonempty_new_vars = TagVariables(Map::from_iter(vec![
			("a".to_owned(), a_val_1.clone()),
			("d".to_owned(), d_val_1.clone()),
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

				let a_val_2 = VV::String("this is a_val_3".to_owned());
				let c_val_2 = VV::Number(CN::Float(5.5));
				let nonempty_new_vars_2 = TagVariables(Map::from_iter(vec![
					("a".to_owned(), a_val_2.clone()),
					("b".to_owned(), b_val_0.clone()),
					("c".to_owned(), c_val_2.clone()),
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

mod root {
	use super::*;

	#[test]
	fn with_new() {
		let context = DecodingContext::new_at_root("root0".into());

		assert_eq!(*context.get_root(), Path::new("root0"));

		context
			.with_new_root("root1".into(), || {
				assert_eq!(*context.get_root(), Path::new("root1"));

				context
					.with_new_root("root2".into(), || {
						assert_eq!(*context.get_root(), Path::new("root2"));
						Ok(())
					})
					.unwrap();

				assert_eq!(*context.get_root(), Path::new("root1"));

				context
					.with_new_root("root3".into(), || {
						assert_eq!(*context.get_root(), Path::new("root3"));
						Ok(())
					})
					.unwrap();

				assert_eq!(*context.get_root(), Path::new("root1"));

				Ok(())
			})
			.unwrap();

		assert_eq!(*context.get_root(), Path::new("root0"));
	}
}

mod substitution {
	use super::*;

	#[test]
	fn ok() {
		let empty_context = DecodingContext::new_empty();
		assert_eq!(empty_context.eval_exprs_in_str("").unwrap(), "");
		assert_eq!(empty_context.eval_exprs_in_str("xyz").unwrap(), "xyz");

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars([
			("a", &VV::Number(CN::Int(1))),
			("b", &VV::Number(CN::UInt(2))),
			("c", &VV::Number(CN::Float(3.0))),
			("d", &VV::Number(CN::Float(4.5))),
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

	#[test]
	fn parse_errors() {
		use super::{VariableSubstitutionError, VariableValue as VV};

		#[track_caller]
		fn test<V>(context: &DecodingContext, s: &str, err: V)
		where
			V: Into<Vec<VariableSubstitutionError>>,
		{
			assert_eq!(
				context.eval_exprs_in_str(s).unwrap_err(),
				err.into().into_iter().map(|e| e.into()).collect::<Vec<_>>()
			);
		}

		let empty_context = DecodingContext::new_empty();

		let vars = vec![
			("a", VV::Number(CN::Int(1))),
			("b", VV::Number(CN::UInt(2))),
			("c", VV::String("abc".to_owned())),
			("d", VV::String(r"\".to_owned())),
			("e", VV::String(r"\{}".to_owned())),
		];
		let nonempty_context = DecodingContext::new_with_vars(vars.iter().map(|(k, v)| (*k, v)));

		test(
			&empty_context,
			r"\",
			[VariableSubstitutionError::TrailingBackslash],
		);
		test(
			&empty_context,
			r"x\",
			[VariableSubstitutionError::TrailingBackslash],
		);
		test(
			&empty_context,
			r"xytas\{\}\",
			[VariableSubstitutionError::TrailingBackslash],
		);
		test(
			&nonempty_context,
			r"xytas{c}\",
			[VariableSubstitutionError::TrailingBackslash],
		);
		test(
			&nonempty_context,
			r"xytas{xy}\",
			[
				VariableSubstitutionError::MissingVariable("xy".into()),
				VariableSubstitutionError::TrailingBackslash,
			],
		);
		test(
			&nonempty_context,
			r"xytas{d}\",
			// two tailing backslashes because d is itself a trailing backslash
			[
				VariableSubstitutionError::TrailingBackslash,
				VariableSubstitutionError::TrailingBackslash,
			],
		);
		test(
			&nonempty_context,
			r"\xytas{a}\\{e}\",
			[
				invalid_esc('x'),
				// Because e is a bad backslash
				VariableSubstitutionError::UnmatchedRightBrace,
				VariableSubstitutionError::TrailingBackslash,
			],
		);

		test(
			&empty_context,
			"{",
			[VariableSubstitutionError::UnmatchedLeftBrace],
		);
		test(
			&empty_context,
			"{xyz",
			[VariableSubstitutionError::UnmatchedLeftBrace],
		);
		test(
			&empty_context,
			"}",
			[VariableSubstitutionError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"xyz}",
			[VariableSubstitutionError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"{xyz}{",
			[
				missing_var("xyz"),
				VariableSubstitutionError::UnmatchedLeftBrace,
			],
		);
		test(
			&empty_context,
			"{xyz}}",
			[
				missing_var("xyz"),
				VariableSubstitutionError::UnmatchedRightBrace,
			],
		);
		test(
			&nonempty_context,
			"{a}{b}}",
			[VariableSubstitutionError::UnmatchedRightBrace],
		);
		test(
			&empty_context,
			"{xyz}6789}ajshd",
			[
				missing_var("xyz"),
				VariableSubstitutionError::UnmatchedRightBrace,
			],
		);

		test(
			&empty_context,
			r"ak{jh}sd{js",
			[
				missing_var("jh"),
				VariableSubstitutionError::UnmatchedLeftBrace,
			],
		);

		test(
			&empty_context,
			r"ak{\jh}sd{js",
			[
				invalid_expr("\\jh"),
				VariableSubstitutionError::UnmatchedLeftBrace,
			],
		);
		test(
			&empty_context,
			r"ak{xyjh}sd{\Ks",
			[
				missing_var("xyjh"),
				VariableSubstitutionError::UnmatchedLeftBrace,
				VariableSubstitutionError::InvalidEscapedChar('K'),
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
					.map(|s| VariableSubstitutionError::MissingVariable(s.to_owned()))
					.collect::<Vec<_>>()
			)
		}

		let empty_context = DecodingContext::new_empty();

		test(&empty_context, "{missing_var}", ["missing_var"]);
		test(&empty_context, "{mv1} {mv2}", ["mv1", "mv2"]);
		test(&empty_context, "a {mv1} b {mv2} c", ["mv1", "mv2"]);

		let xyz_ref = "xyz";
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
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
					.map(
						|s| VariableSubstitutionError::InvalidVariableNameOrExpression(
							s.to_owned()
						)
					)
					.collect::<Vec<_>>()
			)
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
			vars: impl Into<Vec<VariableSubstitutionError>>,
		) {
			assert_eq!(
				context.eval_exprs_in_str(input.as_ref()).err().unwrap(),
				vars.into()
			)
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
		let xyz_string = VV::String(xyz_ref.to_string());
		let nonempty_context = DecodingContext::new_with_vars(vec![
			("a", &VV::Number(CN::Int(1))),
			("b", &VV::Number(CN::UInt(2))),
			("c", &VV::Number(CN::Float(3.0))),
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
