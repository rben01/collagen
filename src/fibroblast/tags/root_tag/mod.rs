use std::{fs, io, path::Path, rc::Rc};

use super::{
	validation::Validatable, AnyChildTag, ClgnDecodingResult, DeChildTags, DeXmlAttrs,
	DecodingContext, Extras, UnvalidatedDeChildTags, XmlAttrs,
};
use crate::{
	cli::{DiskBackedFs, InMemoryFs, InMemoryFsContent, ManifestFormat, ProvidedInput, Slice},
	from_json::{decoding_error::InvalidSchemaErrorList, ClgnDecodingError},
	to_svg::svg_writable::{prepare_and_write_tag, SvgWritable},
};
use jsonnet::JsonnetVm;
use serde::{Deserialize, Serialize};

/// The document root (`<svg>...<svg>`). A `collagen.json` file is expected to contain a
/// single object; that object is always implicitly of type `RootTag`. The set of keys
/// does not matter — even `{}` is perfectly valid (it will be turned into simply `<svg
/// xmlns="http://www.w3.org/2000/svg"></svg>`).
#[derive(Debug, Clone, Serialize)]
pub struct RootTag {
	#[serde(flatten)]
	inner: Inner,

	children: DeChildTags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Inner {
	attrs: DeXmlAttrs,
}

#[derive(Clone, Copy)]
enum Input<'a> {
	Str { content: &'a str, path: &'a Path },
	Path(&'a Path),
}

impl Input<'_> {
	fn evaluate_as_jsonnet(self) -> ClgnDecodingResult<RootTag> {
		let mut vm = JsonnetVm::new();

		let (eval_result, path) = match self {
			Input::Str { content, path } => (vm.evaluate_snippet(path, content), path),
			Input::Path(path) => (vm.evaluate_file(path), path),
		};

		let json_str = match eval_result {
			Ok(s) => s,
			Err(err) => {
				return Err(ClgnDecodingError::JsonnetRead {
					msg: err.to_string(),
					path: path.to_owned(),
				})
			}
		};

		let mut errors = InvalidSchemaErrorList::new();
		serde_json::from_str::<UnvalidatedRootTag>(&json_str)
			.map_err(|source| ClgnDecodingError::JsonDecodeJsonnet {
				source,
				path: path.to_owned(),
			})?
			.into_validated(&mut errors)
			.map_err(|()| errors.into())
	}

	fn evaluate_as_pure_json(self) -> ClgnDecodingResult<RootTag> {
		fn evaluate_reader(r: impl io::Read, path: &Path) -> ClgnDecodingResult<RootTag> {
			let mut errors = InvalidSchemaErrorList::new();
			serde_json::from_reader::<_, UnvalidatedRootTag>(r)
				.map_err(|source| ClgnDecodingError::JsonDecodeFile {
					source,
					path: path.to_owned(),
				})?
				.into_validated(&mut errors)
				.map_err(|()| errors.into())
		}

		match self {
			Input::Str { content, path } => evaluate_reader(io::Cursor::new(content), path),
			Input::Path(path) => evaluate_reader(
				fs::File::open(path).map_err(|source| ClgnDecodingError::IoRead {
					source,
					path: path.to_owned(),
				})?,
				path,
			),
		}
	}
}

impl RootTag {
	fn new_from_in_memory_fs(
		input: &InMemoryFs,
		format: ManifestFormat,
	) -> ClgnDecodingResult<Self> {
		let InMemoryFs {
			root_path: _,
			content,
		} = input;

		let InMemoryFsContent { bytes, slices } = &*Rc::clone(content);

		let slice @ Slice { start, offset } = *slices
			.get(format.manifest_path())
			.ok_or(ClgnDecodingError::MissingJsonnetFile)?;

		let manifest_bytes =
			bytes
				.get(start..start + offset)
				.ok_or(ClgnDecodingError::InMemoryFs {
					slice,
					len: bytes.len(),
				})?;

		let path_str = format!("file '{}' in {input}", format.manifest_filename());

		let manifest_str =
			std::str::from_utf8(manifest_bytes).map_err(|_| ClgnDecodingError::InMemoryFs {
				slice,
				len: bytes.len(),
			})?;

		let input = Input::Str {
			content: manifest_str,
			path: Path::new(&path_str),
		};

		match format {
			ManifestFormat::Json => input.evaluate_as_pure_json(),
			ManifestFormat::Jsonnet => input.evaluate_as_jsonnet(),
		}
	}

	fn new_from_disk(input: &DiskBackedFs, format: ManifestFormat) -> ClgnDecodingResult<Self> {
		let manifest_path = match input {
			DiskBackedFs::File { file, parent: _ } => *file,
			DiskBackedFs::Folder(folder) => &folder.join(format.manifest_filename()),
		};

		let input = Input::Path(manifest_path);

		match format {
			ManifestFormat::Json => input.evaluate_as_pure_json(),
			ManifestFormat::Jsonnet => input.evaluate_as_jsonnet(),
		}
	}

	pub(crate) fn new(input: &ProvidedInput, format: ManifestFormat) -> ClgnDecodingResult<Self> {
		match input {
			ProvidedInput::DiskBackedFs(fs) => Self::new_from_disk(fs, format),
			ProvidedInput::InMemoryFs(fs) => Self::new_from_in_memory_fs(fs, format),
		}
	}

	pub(crate) fn attrs(&self) -> &XmlAttrs {
		self.inner.attrs.as_ref()
	}

	pub(crate) fn children(&self) -> &[AnyChildTag] {
		self.children.as_ref()
	}
}

impl SvgWritable for RootTag {
	fn to_svg(
		&self,
		writer: &mut quick_xml::Writer<impl io::Write>,
		context: &DecodingContext,
	) -> ClgnDecodingResult<()> {
		prepare_and_write_tag(
			writer,
			"svg",
			|elem| {
				let attrs = self.inner.attrs.as_ref();

				let xmlns = "xmlns";
				if !attrs.iter().any(|(k, _)| k == xmlns) {
					elem.push_attribute((xmlns, "http://www.w3.org/2000/svg"));
				}
				attrs.write_into(elem);
			},
			|writer| {
				for child in self.children.as_ref() {
					child.to_svg(writer, context)?;
				}

				Ok(())
			},
		)
	}
}

#[derive(Debug, Deserialize)]
pub struct UnvalidatedRootTag {
	#[serde(flatten)]
	inner: Inner,

	children: UnvalidatedDeChildTags,

	#[serde(flatten)]
	extras: Extras,
}

impl Validatable for UnvalidatedRootTag {
	type Validated = RootTag;

	fn into_validated(self, errors: &mut InvalidSchemaErrorList) -> Result<Self::Validated, ()> {
		let Self {
			inner: Inner { attrs },
			children,
			extras,
		} = self;

		if let Err(err) = extras.ensure_empty("svg root") {
			errors.push(err);
		}

		Ok(RootTag {
			inner: Inner { attrs },
			children: children.into_validated(errors)?,
		})
	}
}
