use base64::Engine;

pub(crate) use std::collections::BTreeMap as Map;
#[cfg(feature = "cli")]
pub(crate) use std::collections::BTreeSet as Set;

pub(crate) fn b64_encode(s: impl AsRef<[u8]>) -> String {
	let engine = base64::engine::general_purpose::STANDARD_NO_PAD;
	engine.encode(s)
}

/// Stream base64 encode data directly to a writer to reduce memory usage
pub(crate) fn b64_encode_streaming<W: std::io::Write>(
	bytes: &[u8], 
	writer: &mut W
) -> std::io::Result<()> {
	use base64::engine::general_purpose::STANDARD_NO_PAD;
	
	// Process data in chunks to avoid loading everything into memory
	const CHUNK_SIZE: usize = 3 * 1024; // 3KB chunks (multiple of 3 for base64 efficiency)
	
	for chunk in bytes.chunks(CHUNK_SIZE) {
		let encoded = STANDARD_NO_PAD.encode(chunk);
		writer.write_all(encoded.as_bytes())?;
	}
	
	Ok(())
}

#[macro_export]
macro_rules! regex {
	($re:literal $(,)?) => {{
		static RE: once_cell::sync::OnceCell<regex::Regex> = once_cell::sync::OnceCell::new();
		RE.get_or_init(|| regex::Regex::new($re).unwrap())
	}};
}
