//! Contains the data types used for the in-memory representation of a `Fibroblast`.

mod simple_value;

pub(crate) use simple_value::SimpleValue;
use std::path::PathBuf;

use crate::{from_json::ClgnDecodingError, ClgnDecodingResult};

/// A context in which something can be decoded
///
/// Consists of the root path (for resolving relative paths) and a variable key-value
/// map for performing variable substitution
#[derive(Debug, Clone)]
pub struct DecodingContext {
	pub(crate) root_path: PathBuf,
}

impl DecodingContext {
	pub(crate) fn new(root_path: PathBuf) -> Self {
		Self { root_path }
	}

	pub(crate) fn new_at_root(root_path: PathBuf) -> Self {
		Self::new(root_path)
	}

	/// Like `p.as_ref().join(s.as_ref())` (see
	/// [`std::path::PathBuf::join()`](https://doc.rust-lang.org/std/path/struct.PathBuf.html#method.join)),
	/// except that this converts forward slashes in `s` to platform-specific the path
	/// separator first. Roughly the equivalent of `p.as_ref().join(s.as_ref().replace("/",
	/// PATH_SEP))`, but some care has to be taken to handle edge cases.
	///
	/// Assumptions:
	/// 1. `p` itself uses the path-specific path separator already, as only `s`'s forward
	///    slashes will be replaced.
	/// 2. `s` does not start with `/` (if it does, `Err` will be returned).
	///
	/// Note that absolutely nothing is done to the contents of `p`, as it's merely cloned
	/// and that clone pushed to. Also, very little normalization is done; the only
	/// non-naive thing that happens is that multiple consecutive path separators in `s` are
	/// condensed down to a single one. In particular, neither `.` nor `..` have special
	/// meaning; they're just treated as ordinary file names.
	//
	// TODO: check that this actually works on Windows
	pub(crate) fn canonicalize(&self, path: impl AsRef<str>) -> ClgnDecodingResult<PathBuf> {
		fn inner(this: &DecodingContext, path: &str) -> ClgnDecodingResult<PathBuf> {
			if path.starts_with('/') {
				return Err(ClgnDecodingError::InvalidPath(PathBuf::from(path)));
			}

			let mut pathbuf = this.root_path.clone();
			for part in path.split('/') {
				pathbuf.push(part);
			}
			Ok(pathbuf)
		}

		inner(self, path.as_ref())
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::path::{Path, PathBuf};

	mod ok {
		use super::*;

		#[allow(dead_code)]
		#[derive(Debug)]
		enum PlatformPaths<'a> {
			Same(&'a str),
			Different { windows: &'a str, other: &'a str },
		}

		#[track_caller]
		fn test_join_inner(p: &Path, s: &str, expected: &PlatformPaths) {
			if p.to_string_lossy().ends_with(&['/', '\\'][..]) {
				assert!(
					matches!(expected, PlatformPaths::Different { .. }),
					"Path {p:?} ends with a platform-specific separator and so \
					 must have platform-specific expected behavior; got {expected:?}"
				);
			}

			let context = DecodingContext::new(p.to_owned());

			let platform;
			let path_sep;
			let expected_str;

			if cfg!(target_os = "windows") {
				platform = "windows";
				path_sep = "\\";
				expected_str = match expected {
					PlatformPaths::Same(path) => path,
					PlatformPaths::Different { windows, .. } => windows,
				};
			} else {
				platform = "not-windows";
				path_sep = "/";
				expected_str = match expected {
					PlatformPaths::Same(path) => path,
					PlatformPaths::Different { other, .. } => other,
				};
			}

			let expected = PathBuf::from(expected_str.replace('|', path_sep));
			let actual = context.canonicalize(s).unwrap();

			assert_eq!(
				actual, expected,
				"Platform = {platform:?}; joined {p:?} and {s:?}, \
				 got {actual:?}; expected {expected:?}"
			);
		}

		/// Test that `pathsep_aware_join(p, s)` gives the potentially platform-specific
		/// string(s) in `expected`. Before performing `pathsep_aware_join`, pipe characters
		/// `|` in `s` are replaced with the platform-specific separator (and so they must
		/// not be a character in any path component's name).
		#[track_caller]
		fn test_join(p: impl AsRef<Path>, s: impl AsRef<str>, expected: &PlatformPaths) {
			let p = p.as_ref();
			let s = s.as_ref();

			test_join_inner(p, s, expected);
		}

		/// Tests that `join(p, s)`, `join(p+'/', s)`, and `join(p+'\\', s)` all work
		/// correctly (if some new system with new path separators arises in the future,
		/// it'll have to be added).
		///
		/// `p` must not end with any path separator
		#[track_caller]
		fn test_join_with_all_pathsep_suffixes(
			p: impl AsRef<Path>,
			s: impl AsRef<str>,
			expected: (&str, &str),
		) {
			use PlatformPaths::*;

			let p = p.as_ref().to_str().unwrap();
			let s = s.as_ref();
			let (left, right) = expected;

			test_join(p, s, &Same(format!("{left}|{right}").as_ref()));
			test_join(
				format!("{p}/").as_str(),
				s,
				&Different {
					windows: format!("{left}/|{right}").as_ref(),
					other: format!("{left}/{right}").as_ref(),
				},
			);
			test_join(
				format!("{p}\\").as_str(),
				s,
				&Different {
					windows: format!("{left}|{right}").as_ref(),
					other: format!("{left}\\|{right}").as_ref(),
				},
			);
		}

		#[test]
		fn empty_path() {
			#[track_caller]
			fn test_it(s: impl AsRef<str>, expected: impl AsRef<str>) {
				test_join("", s, &PlatformPaths::Same(expected.as_ref()));
			}

			test_it("", "");

			test_it("a", "a");
			test_it("a/", "a|");
			test_it("a//", "a|");
			test_it("a///", "a|");

			test_it("a/b", "a|b");
			test_it("a//b", "a|b");
			test_it("a/b/", "a|b|");
			test_it("a//b/", "a|b|");
			test_it("a//b//", "a|b|");
			test_it("a///b///", "a|b|");

			test_it("a/b/c", "a|b|c");
			test_it("a//b/c", "a|b|c");
			test_it("a/b//c", "a|b|c");
			test_it("a/b/c/", "a|b|c|");
			test_it("a//b//c", "a|b|c");
			test_it("a//b/c//", "a|b|c|");
			test_it("a/b//c//", "a|b|c|");
			test_it("a//b//c//", "a|b|c|");
			test_it("a///b///c///", "a|b|c|");
		}

		#[test]
		fn nonempty_path() {
			#[track_caller]
			fn test_it(s: impl AsRef<str>, expected: impl AsRef<str>) {
				test_join_with_all_pathsep_suffixes("r/s", s, ("r/s", expected.as_ref()));
			}

			test_it("", "");

			test_it("a", "a");
			test_it("a/", "a|");
			test_it("a//", "a|");
			test_it("a///", "a|");

			test_it("a/b", "a|b");
			test_it("a//b", "a|b");
			test_it("a/b/", "a|b|");
			test_it("a//b/", "a|b|");
			test_it("a//b//", "a|b|");
			test_it("a///b///", "a|b|");

			test_it("a/b/c", "a|b|c");
			test_it("a//b/c", "a|b|c");
			test_it("a/b//c", "a|b|c");
			test_it("a/b/c/", "a|b|c|");
			test_it("a//b//c", "a|b|c");
			test_it("a//b/c//", "a|b|c|");
			test_it("a/b//c//", "a|b|c|");
			test_it("a//b//c//", "a|b|c|");
			test_it("a///b///c///", "a|b|c|");
		}

		#[test]
		fn pathological() {
			use PlatformPaths::*;

			test_join(
				"/",
				"",
				&Different {
					windows: "/|",
					other: "/",
				},
			);
			test_join(
				"\\",
				"",
				&Different {
					windows: "|",
					other: "\\|",
				},
			);

			test_join(
				"r//",
				"",
				&Different {
					windows: "r//|",
					other: "r//",
				},
			);
			test_join(
				"r/\\",
				"",
				&Different {
					windows: "r/\\",
					other: "r/\\|",
				},
			);

			test_join(
				"r\\\\",
				"",
				&Different {
					windows: "r\\\\",
					other: "r\\\\|",
				},
			);
			test_join(
				"r\\/",
				"",
				&Different {
					windows: "r\\/|",
					other: "r\\/",
				},
			);
		}
	}

	mod errors {
		use super::*;

		#[test]
		fn joining_leading_pathsep() {
			#[track_caller]
			fn assert_err(c: &DecodingContext, s: &str) {
				let result = c.canonicalize(s);
				assert!(
					matches!(result, Err(ClgnDecodingError::InvalidPath(_))),
					"Expected an InvalidPath error when joining {:?} \
					 and {s:?}, but got {result:?} instead",
					c.root_path
				);
			}

			// The logic is pretty simple; `p` is ignored until `s` is verified
			let context = DecodingContext::new(PathBuf::from(""));
			assert_err(&context, "/");
			assert_err(&context, "/a");
		}
	}
}
