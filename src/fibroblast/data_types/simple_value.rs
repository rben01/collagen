use compact_str::{CompactString, ToCompactString};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

use super::concrete_number::{ConcreteNumberVisitor, Number};

/// An enum whose variants represent "simple" (indivisible) values. This owns all of its
/// values (*maybe* could be replaced with `SimpleValue<'a> { Text(Cow<'a, str>) }` but
/// almost certainly not worth the cost of the refactor)
#[derive(Debug)]
#[cfg_attr(test, derive(PartialEq))]
pub(crate) enum SimpleValue {
	Number(Number),
	Text(CompactString),
	/// The presence of an attribute — usually represented `attr=""`
	Present,
	/// The absence of an attribute. How is this different from just ommitting the
	/// attribute altogether? Having an explicit option to drop attribtues may come in
	/// handy if we end up wanting to explicitly opt out of an attribute
	Absent,
}

impl Clone for SimpleValue {
	/// Everything but `Text` is `Copy`; `Text` needs to be cloned
	fn clone(&self) -> Self {
		use SimpleValue::*;

		match self {
			Text(s) => Text(s.clone()),
			Number(x) => Number(*x),
			Present => Present,
			Absent => Absent,
		}
	}
}

impl Serialize for SimpleValue {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		use self::SimpleValue::*;

		match self {
			Number(n) => n.serialize(serializer),
			Text(s) => serializer.serialize_str(s),
			Present => serializer.serialize_bool(true),
			Absent => serializer.serialize_bool(false),
		}
	}
}

impl<'de> Deserialize<'de> for SimpleValue {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: Deserializer<'de>,
	{
		struct SimpleValueVisitor;

		impl<'de> de::Visitor<'de> for SimpleValueVisitor {
			type Value = SimpleValue;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter.write_str("a string, a number, or a bool")
			}

			fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_i64(v).map(SimpleValue::Number)
			}

			fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_u64(v).map(SimpleValue::Number)
			}

			fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				ConcreteNumberVisitor.visit_f64(v).map(SimpleValue::Number)
			}

			fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(SimpleValue::Text(v.to_compact_string()))
			}

			/// `true` -> Present, `false` -> Absent
			fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
			where
				E: serde::de::Error,
			{
				Ok(if v {
					SimpleValue::Present
				} else {
					SimpleValue::Absent
				})
			}
		}

		deserializer.deserialize_any(SimpleValueVisitor)
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
		assert_tokens(&SimpleValue::Present, &[Token::Bool(true)]);
		assert_tokens(&SimpleValue::Absent, &[Token::Bool(false)]);
	}
}
