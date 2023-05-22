pub(crate) mod paths;
use base64::Engine;

pub(crate) fn b64_encode(s: impl AsRef<[u8]>) -> String {
	let engine = base64::engine::general_purpose::STANDARD_NO_PAD;
	engine.encode(s)
}
