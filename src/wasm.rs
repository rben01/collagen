//! WebAssembly bindings for Collagen
//!
//! This module provides a JavaScript-compatible API for generating SVG collages
//! from uploaded files in the browser.

use crate::{
	fibroblast::Fibroblast,
	filesystem::{InMemoryFs, InMemoryFsContent, ManifestFormat, ProvidedInput},
	from_json::ClgnDecodingError,
};
use js_sys::{Array, Map, Uint8Array};
use std::{
	collections::HashMap,
	marker::PhantomData,
	path::{Path, PathBuf},
	rc::Rc,
};
use wasm_bindgen::prelude::*;
use web_sys::{console::log, File};

// Initialize panic hook for better error messages in the browser
#[wasm_bindgen(start)]
pub fn init() {
	console_error_panic_hook::set_once();
}

/// JavaScript-compatible error type for Collagen operations
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct CollagenError {
	message: String,
	error_type: &'static str,
}

#[wasm_bindgen]
impl CollagenError {
	#[wasm_bindgen(getter)]
	#[must_use]
	pub fn message(&self) -> String {
		self.message.clone()
	}

	#[wasm_bindgen(getter, js_name = "errorType")]
	#[must_use]
	pub fn error_type(&self) -> String {
		self.error_type.to_owned()
	}
}

impl From<ClgnDecodingError> for CollagenError {
	fn from(err: ClgnDecodingError) -> Self {
		CollagenError {
			message: err.to_string(),
			error_type: err.into(),
		}
	}
}

/// JavaScript-compatible result type
type WasmResult<T> = Result<T, CollagenError>;

/// Convert a JavaScript Map of files to an InMemoryFs
///
/// Outside of test code, this is where a [`InMemoryFsHandle`] is actually created in
/// Rust
///
/// # Parameters
/// - `files_map`: JavaScript Map containing file paths (keys) and File objects (values)
/// - `folder_name`: Optional folder name for logging/debugging context
///
/// # Errors
/// - When for some reason the incoming Map does not iterate key-value pairs of
///   `[string, File]`
/// - When the `File` cannot be read
/// - When memory allocation fails due to large files or many files
#[wasm_bindgen(js_name = "createInMemoryFs")]
pub async fn create_in_memory_fs(files_map: Map) -> WasmResult<InMemoryFsHandle> {
	// Check memory constraints before processing
	const MAX_TOTAL_SIZE: usize = 50 * 1024 * 1024; // 50MB limit
	const MAX_SINGLE_FILE_SIZE: usize = 20 * 1024 * 1024; // 20MB per file

	let mut files = HashMap::new();

	let mut total_size = 0usize;

	for entry in files_map.entries() {
		// TODO: don't unwrap here
		let entry = entry.unwrap();
		let entry = js_sys::Array::from(&entry);
		let entry = Array::from(&entry);
		let path_str = entry.get(0).as_string().ok_or_else(|| CollagenError {
			message: "Invalid file path in map".to_string(),
			error_type: "InvalidInput",
		})?;

		let file = entry.get(1).dyn_into::<File>().map_err(|_| CollagenError {
			message: "Invalid file object in map".to_string(),
			error_type: "InvalidInput",
		})?;

		// Check individual file size before processing
		#[allow(clippy::cast_possible_truncation)]
		#[allow(clippy::cast_sign_loss)]
		let file_size = file.size() as usize;

		if file_size > MAX_SINGLE_FILE_SIZE {
			return Err(CollagenError {
				message: format!(
					"File {:?} is too large ({:.1}KB). \
					 Maximum file size is {:.1}KB. \
					 Try using smaller images or reducing file count.",
					path_str,
					file_size / 1024,
					MAX_SINGLE_FILE_SIZE / 1024
				),
				error_type: "FileSizeError",
			});
		}

		// Check if adding this file would exceed total size limit
		if total_size + file_size > MAX_TOTAL_SIZE {
			return Err(CollagenError {
				message: format!(
					"Total file size would exceed limit ({:.1}KB). Current: {:.1}KB, Adding: {:.1}KB, Maximum: {:.1}KB. Try reducing the number of files or using smaller images.",
					(total_size + file_size) / 1024,
					total_size / 1024,
					file_size / 1024,
					MAX_TOTAL_SIZE / 1024
				),
				error_type: "TotalSizeError",
			});
		}

		// Read file content with error handling for memory issues
		let array_buffer = wasm_bindgen_futures::JsFuture::from(file.array_buffer())
			.await
			.map_err(|e| {
				// Try to detect memory-related errors
				let error_msg = format!("{e:?}");
				if error_msg.contains("memory") || error_msg.contains("allocation") {
					CollagenError {
						message: format!(
							"Memory allocation failed while reading {:?} ({:.1}KB).
							 Try uploading fewer or smaller files.",
							path_str,
							file_size / 1024
						),
						error_type: "MemoryError",
					}
				} else {
					CollagenError {
						message: format!("Failed to read file content for {path_str:?}"),
						error_type: "FileReadError",
					}
				}
			})?;

		let uint8_array = Uint8Array::new(&array_buffer);

		// Convert to Vec - if this fails, the WASM module will trap which is better than
		// trying to catch panics
		//
		// TODO: not a fan of allocating twice here (once for the Uint8Array, once for the
		// Vec) -- any solution?
		let file_bytes = uint8_array.to_vec();

		// Check if we have enough space for this file
		if total_size + file_bytes.len() > MAX_TOTAL_SIZE {
			return Err(CollagenError {
				message: format!(
					"Memory allocation would exceed total limit while processing {:?}. Current: {:.1}KB, Adding: {:.1}KB, Maximum: {:.1}KB. Try uploading fewer or smaller files.",
					path_str,
					total_size / 1024,
					file_bytes.len() / 1024,
					MAX_TOTAL_SIZE / 1024,
				),
				error_type: "MemoryError",
			});
		}

		// Store slice information
		files.insert(PathBuf::from(path_str), file_bytes);

		// Append to bytes - if this fails due to memory, WASM will trap
		total_size += file_size;
	}

	let in_memory_fs = InMemoryFs {
		content: Rc::new(InMemoryFsContent { files }),
	};

	Ok(InMemoryFsHandle { fs: in_memory_fs })
}

/// Handle for the in-memory filesystem
#[wasm_bindgen]
pub struct InMemoryFsHandle {
	fs: InMemoryFs,
}

/// Generate SVG from an in-memory filesystem
///
/// # Errors
/// When the format string is provided but not supported (WASM builds only support JSON)
#[wasm_bindgen(js_name = "generateSvg")]
#[allow(clippy::needless_pass_by_value)]
pub fn generate_svg(fs_handle: &InMemoryFsHandle, format: Option<String>) -> WasmResult<String> {
	let manifest_format = match format.as_deref() {
		Some("json") => Some(ManifestFormat::Json),
		#[cfg(feature = "jsonnet")]
		Some("jsonnet") => Some(ManifestFormat::Jsonnet),
		None => None,
		Some(other) => {
			let supported_formats = if cfg!(feature = "jsonnet") {
				"json or jsonnet"
			} else {
				"json only (jsonnet not available in WASM builds)"
			};

			return Err(CollagenError {
				message: format!(
					"Unsupported manifest format: {other}. Supported formats: {supported_formats}"
				),
				error_type: "InvalidFormat",
			});
		}
	};

	let input = ProvidedInput::InMemoryFs(fs_handle.fs.clone(), PhantomData);

	// Create fibroblast - enhanced error handling for memory issues
	let fibroblast = Fibroblast::new(&input, manifest_format).map_err(|e| {
		// Check if this is likely a memory-related error during image processing
		let error_msg = format!("{e}");
		if error_msg.contains("allocation")
			|| error_msg.contains("memory")
			|| error_msg.contains("out of memory")
		{
			CollagenError {
				message: format!(
					"Memory allocation failed during SVG generation. \
					 This often happens with large images. Try using smaller \
					 images or fewer files. Original error: {error_msg:?}"
				),
				error_type: "MemoryError",
			}
		} else {
			CollagenError::from(e)
		}
	})?;

	// Generate SVG - if this fails due to memory, WASM will trap
	let mut svg_bytes = Vec::new();
	let mut writer = quick_xml::Writer::new(&mut svg_bytes);

	log(&js_sys::Array::from_iter([JsValue::from_str(&format!(
		"{fibroblast:?}"
	))]));

	fibroblast.to_svg(&mut writer).map_err(|e| {
		let error_msg = format!("{e}");
		if error_msg.contains("allocation")
			|| error_msg.contains("memory")
			|| error_msg.contains("out of memory")
		{
			CollagenError {
				message: format!(
					"Memory allocation failed during SVG writing. \
					 Try using smaller images or fewer files. \
					 Original error: {error_msg:?}"
				),
				error_type: "MemoryError",
			}
		} else {
			CollagenError::from(e)
		}
	})?;

	log(&js_sys::Array::from_iter([JsValue::from_str(&format!(
		"{svg_bytes:?}"
	))]));

	String::from_utf8(svg_bytes).map_err(|_| CollagenError {
		message: "Generated SVG contains invalid UTF-8".to_string(),
		error_type: "EncodingError",
	})
}

/// Get a list of supported manifest formats
#[wasm_bindgen(js_name = "getSupportedFormats")]
#[must_use]
pub fn get_supported_formats() -> Array {
	let formats = Array::new();
	formats.push(&JsValue::from_str("json"));
	#[cfg(feature = "jsonnet")]
	formats.push(&JsValue::from_str("jsonnet"));
	formats
}

/// Get information about the in-memory filesystem
#[wasm_bindgen]
impl InMemoryFsHandle {
	#[wasm_bindgen(js_name = "getFileCount")]
	#[must_use]
	pub fn get_file_count(&self) -> usize {
		self.fs.content.files.len()
	}

	#[wasm_bindgen(js_name = "getTotalSize")]
	#[must_use]
	pub fn get_total_size(&self) -> usize {
		self.fs.content.files.values().map(|f| f.len()).sum()
	}

	#[wasm_bindgen(js_name = "getFilePaths")]
	#[must_use]
	pub fn get_file_paths(&self) -> Array {
		let paths = Array::new();
		for path in self.fs.content.files.keys() {
			paths.push(&JsValue::from_str(&path.to_string_lossy()));
		}
		paths
	}

	#[wasm_bindgen(js_name = "hasManifest")]
	#[must_use]
	pub fn has_manifest(&self) -> String {
		#[cfg(feature = "jsonnet")]
		let has_jsonnet = self
			.fs
			.content
			.files
			.contains_key(Path::new("collagen.jsonnet"));

		#[cfg(feature = "jsonnet")]
		if has_jsonnet {
			return "jsonnet".to_owned();
		}

		{
			let has_json = self
				.fs
				.content
				.files
				.contains_key(Path::new("collagen.json"));
			if has_json {
				"json".to_owned()
			} else {
				"none".to_owned()
			}
		}
	}
}
