pub(crate) mod paths;
use base64::Engine;

pub(crate) fn b64_encode(s: impl AsRef<[u8]>) -> String {
	let engine = base64::engine::general_purpose::STANDARD_NO_PAD;
	engine.encode(s)
}

#[macro_export]
macro_rules! regex {
	($re:literal $(,)?) => {{
		static RE: once_cell::sync::OnceCell<regex::Regex> = once_cell::sync::OnceCell::new();
		RE.get_or_init(|| regex::Regex::new($re).unwrap())
	}};
}
