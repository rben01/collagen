use super::concrete_number::ConcreteNumber;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, fmt};

/// The value of a variable; either a number or a string
#[derive(Serialize, Deserialize, Debug, Clone)]
#[cfg_attr(test, derive(PartialEq))]
#[serde(untagged)]
pub(crate) enum VariableValue {
	Number(ConcreteNumber),
	String(String),
}

impl fmt::Display for VariableValue {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		use VariableValue::*;
		match self {
			Number(n) => write!(f, "{n}"),
			String(s) => write!(f, "{s}"),
		}
	}
}

impl VariableValue {
	pub fn as_str(&self) -> Cow<'_, str> {
		use VariableValue::*;
		match self {
			Number(n) => Cow::Owned(n.to_string()),
			String(s) => Cow::Borrowed(s.as_ref()),
		}
	}
}

impl<T: Into<ConcreteNumber>> From<T> for VariableValue {
	fn from(x: T) -> Self {
		Self::Number(x.into())
	}
}

impl From<String> for VariableValue {
	fn from(s: String) -> Self {
		Self::String(s)
	}
}

#[cfg(test)]
mod tests {
	//! Pretty much copied from [`simple_value`]. There's no need for them to be kept in
	//! sync, but it's just something to keep in mind

	use super::*;
	use serde_test::{assert_tokens, Token};

	#[test]
	fn concrete_number() {
		macro_rules! test {
			($value:expr, $cn_variant:ident, $tok_variant:ident $(,)?) => {
				assert_tokens(
					&VariableValue::Number(ConcreteNumber::$cn_variant($value)),
					&[Token::$tok_variant($value)],
				)
			};
		}

		// ConcreteNumber
		test!(-2.5, Float, F64);
		test!(0.0, Float, F64);
		test!(2.5, Float, F64);

		test!(0, UInt, U64);
		test!(1, UInt, U64);

		test!(-1, Int, I64);
		test!(0, Int, I64);
		test!(1, Int, I64);
	}

	#[test]
	fn text() {
		// Text
		//
		// Some strings taken from
		// https://github.com/minimaxir/big-list-of-naughty-strings ; can you guess
		// which ones?
		//
		// You wouldn't expect any of these tests to fail because Rust should just be
		// checking that the code points are valid and then transcribing the text, but
		// it doesn't hurt to double check
		#[track_caller]
		fn test_text(s: &'static str) {
			assert_tokens(&VariableValue::String(s.to_owned()), &[Token::String(s)]);
		}

		test_text("");
		test_text("a");
		test_text("{}");
		test_text("{:?}");
		test_text("Powerلُلُصّبُلُلصّبُررً ॣ ॣh ॣ ॣ冗");
		test_text("జ్ఞ‌ా");
		test_text(
			r#"Ṱ̺̺̕o͞ ̷i̲̬͇̪͙n̝̗͕v̟̜̘̦͟o̶̙̰̠kè͚̮̺̪̹̱̤ ̖t̝͕̳̣̻̪͞h̼͓̲̦̳̘̲e͇̣̰̦̬͎ ̢̼̻̱̘h͚͎͙̜̣̲ͅi̦̲̣̰̤v̻͍e̺̭̳̪̰-m̢iͅn̖̺̞̲̯̰d̵̼̟͙̩̼̘̳ ̞̥̱̳̭r̛̗̘e͙p͠r̼̞̻̭̗e̺̠̣͟s̘͇̳͍̝͉e͉̥̯̞̲͚̬͜ǹ̬͎͎̟̖͇̤t͍̬̤͓̼̭͘ͅi̪̱n͠g̴͉ ͏͉ͅc̬̟h͡a̫̻̯͘o̫̟̖͍̙̝͉s̗̦̲.̨̹͈̣
		̡͓̞ͅI̗̘̦͝n͇͇͙v̮̫ok̲̫̙͈i̖͙̭̹̠̞n̡̻̮̣̺g̲͈͙̭͙̬͎ ̰t͔̦h̞̲e̢̤ ͍̬̲͖f̴̘͕̣è͖ẹ̥̩l͖͔͚i͓͚̦͠n͖͍̗͓̳̮g͍ ̨o͚̪͡f̘̣̬ ̖̘͖̟͙̮c҉͔̫͖͓͇͖ͅh̵̤̣͚͔á̗̼͕ͅo̼̣̥s̱͈̺̖̦̻͢.̛̖̞̠̫̰
		̗̺͖̹̯͓Ṯ̤͍̥͇͈h̲́e͏͓̼̗̙̼̣͔ ͇̜̱̠͓͍ͅN͕͠e̗̱z̘̝̜̺͙p̤̺̹͍̯͚e̠̻̠͜r̨̤͍̺̖͔̖̖d̠̟̭̬̝͟i̦͖̩͓͔̤a̠̗̬͉̙n͚͜ ̻̞̰͚ͅh̵͉i̳̞v̢͇ḙ͎͟-҉̭̩̼͔m̤̭̫i͕͇̝̦n̗͙ḍ̟ ̯̲͕͞ǫ̟̯̰̲͙̻̝f ̪̰̰̗̖̭̘͘c̦͍̲̞͍̩̙ḥ͚a̮͎̟̙͜ơ̩̹͎s̤.̝̝ ҉Z̡̖̜͖̰̣͉̜a͖̰͙̬͡l̲̫̳͍̩g̡̟̼̱͚̞̬ͅo̗͜.̟
		̦H̬̤̗̤͝e͜ ̜̥̝̻͍̟́w̕h̖̯͓o̝͙̖͎̱̮ ҉̺̙̞̟͈W̷̼̭a̺̪͍į͈͕̭͙̯̜t̶̼̮s̘͙͖̕ ̠̫̠B̻͍͙͉̳ͅe̵h̵̬͇̫͙i̹͓̳̳̮͎̫̕n͟d̴̪̜̖ ̰͉̩͇͙̲͞ͅT͖̼͓̪͢h͏͓̮̻e̬̝̟ͅ ̤̹̝W͙̞̝͔͇͝ͅa͏͓͔̹̼̣l̴͔̰̤̟͔ḽ̫.͕
		Z̮̞̠͙͔ͅḀ̗̞͈̻̗Ḷ͙͎̯̹̞͓G̻O̭̗̮
		"#,
		);
	}
}
