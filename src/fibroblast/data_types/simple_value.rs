use compact_str::CompactString;
use serde::{Deserialize, Serialize};

/// An enum whose variants represent "simple" (indivisible) values: number, text, or
/// bool. Bool represents the presence (`attr=""`) or absence (nothing) of an attribute.
//
// (*maybe* could be replaced with `SimpleValue<'a> { Text(Cow<'a, str>) }` but
// almost certainly not worth the cost of the refactor)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[cfg_attr(test, derive(PartialEq))]
pub(crate) enum SimpleValue {
	Number(serde_json::Number),
	Text(CompactString),
	/// The presence of an attribute — usually represented `attr=""` if true, or nothing
	/// (the explicit absence of an element) if false
	IsPresent(bool),
}

impl SimpleValue {
	/// Convert a JSON-reprentible f64 (ie neither NaN nor infinite) to this
	///
	/// Panics on NaN or inf, but since we only ever get our floats from JSON in
	/// the first place, that won't be a problem in practice.
	#[allow(dead_code)]
	pub(crate) fn from_json_f64(x: f64) -> Self {
		Self::Number(serde_json::Number::from_f64(x).unwrap())
	}
}

#[cfg(test)]
mod tests {

	use super::*;
	use serde_test::{assert_tokens, Token};

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
			assert_tokens(
				&SimpleValue::Text(CompactString::const_new(s)),
				&[Token::String(s)],
			);
		}

		test_text("");
		test_text("a");
		test_text("{}");
		test_text("{:?}");
		test_text("Powerلُلُصّبُلُلصّبُررً ॣ ॣh ॣ ॣ冗");
		test_text("జ్ఞ‌ా");
		test_text(
			#[allow(clippy::needless_raw_string_hashes)]
			r#"Ṱ̺̺̕o͞ ̷i̲̬͇̪͙n̝̗͕v̟̜̘̦͟o̶̙̰̠kè͚̮̺̪̹̱̤ ̖t̝͕̳̣̻̪͞h̼͓̲̦̳̘̲e͇̣̰̦̬͎ ̢̼̻̱̘h͚͎͙̜̣̲ͅi̦̲̣̰̤v̻͍e̺̭̳̪̰-m̢iͅn̖̺̞̲̯̰d̵̼̟͙̩̼̘̳ ̞̥̱̳̭r̛̗̘e͙p͠r̼̞̻̭̗e̺̠̣͟s̘͇̳͍̝͉e͉̥̯̞̲͚̬͜ǹ̬͎͎̟̖͇̤t͍̬̤͓̼̭͘ͅi̪̱n͠g̴͉ ͏͉ͅc̬̟h͡a̫̻̯͘o̫̟̖͍̙̝͉s̗̦̲.̨̹͈̣
		̡͓̞ͅI̗̘̦͝n͇͇͙v̮̫ok̲̫̙͈i̖͙̭̹̠̞n̡̻̮̣̺g̲͈͙̭͙̬͎ ̰t͔̦h̞̲e̢̤ ͍̬̲͖f̴̘͕̣è͖ẹ̥̩l͖͔͚i͓͚̦͠n͖͍̗͓̳̮g͍ ̨o͚̪͡f̘̣̬ ̖̘͖̟͙̮c҉͔̫͖͓͇͖ͅh̵̤̣͚͔á̗̼͕ͅo̼̣̥s̱͈̺̖̦̻͢.̛̖̞̠̫̰
		̗̺͖̹̯͓Ṯ̤͍̥͇͈h̲́e͏͓̼̗̙̼̣͔ ͇̜̱̠͓͍ͅN͕͠e̗̱z̘̝̜̺͙p̤̺̹͍̯͚e̠̻̠͜r̨̤͍̺̖͔̖̖d̠̟̭̬̝͟i̦͖̩͓͔̤a̠̗̬͉̙n͚͜ ̻̞̰͚ͅh̵͉i̳̞v̢͇ḙ͎͟-҉̭̩̼͔m̤̭̫i͕͇̝̦n̗͙ḍ̟ ̯̲͕͞ǫ̟̯̰̲͙̻̝f ̪̰̰̗̖̭̘͘c̦͍̲̞͍̩̙ḥ͚a̮͎̟̙͜ơ̩̹͎s̤.̝̝ ҉Z̡̖̜͖̰̣͉̜a͖̰͙̬͡l̲̫̳͍̩g̡̟̼̱͚̞̬ͅo̗͜.̟
		̦H̬̤̗̤͝e͜ ̜̥̝̻͍̟́w̕h̖̯͓o̝͙̖͎̱̮ ҉̺̙̞̟͈W̷̼̭a̺̪͍į͈͕̭͙̯̜t̶̼̮s̘͙͖̕ ̠̫̠B̻͍͙͉̳ͅe̵h̵̬͇̫͙i̹͓̳̳̮͎̫̕n͟d̴̪̜̖ ̰͉̩͇͙̲͞ͅT͖̼͓̪͢h͏͓̮̻e̬̝̟ͅ ̤̹̝W͙̞̝͔͇͝ͅa͏͓͔̹̼̣l̴͔̰̤̟͔ḽ̫.͕
		Z̮̞̠͙͔ͅḀ̗̞͈̻̗Ḷ͙͎̯̹̞͓G̻O̭̗̮
		"#,
		);
	}

	#[test]
	fn bool() {
		// Present/absent
		assert_tokens(&SimpleValue::IsPresent(true), &[Token::Bool(true)]);
		assert_tokens(&SimpleValue::IsPresent(false), &[Token::Bool(false)]);
	}
}
