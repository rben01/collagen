use super::{
	validation::Validatable, AnyChildTag, ClgnDecodingResult, DeChildTags, DeXmlAttrs,
	DecodingContext, Extras, UnvalidatedDeChildTags, XmlAttrs,
};
use crate::{
	from_json::ClgnDecodingError,
	to_svg::svg_writable::{prepare_and_write_tag, SvgWritable},
};
use jsonnet::JsonnetVm;
use serde::{Deserialize, Serialize};
use std::path::Path;

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

impl RootTag {
	pub(crate) fn new_from_dir_with_jsonnet(path: &Path) -> ClgnDecodingResult<Self> {
		let manifest_path = path.join("collagen.jsonnet");

		let mut vm = JsonnetVm::new();
		let json_str = match vm.evaluate_file(&manifest_path) {
			Ok(s) => s,
			Err(err) => {
				return Err(ClgnDecodingError::JsonnetRead {
					msg: err.to_string(),
					path: manifest_path,
				})
			}
		};

		let root = serde_json::from_str::<UnvalidatedRootTag>(&json_str)
			.map_err(|source| ClgnDecodingError::JsonDecodeJsonnet {
				source,
				path: manifest_path,
			})?
			.validated()?;

		Ok(root)
	}

	pub(crate) fn new_from_dir_with_pure_json(path: &Path) -> ClgnDecodingResult<Self> {
		let manifest_path = path.join("collagen.json");

		let f = match std::fs::File::open(&manifest_path) {
			Ok(f) => f,
			Err(source) => {
				return Err(ClgnDecodingError::IoRead {
					source,
					path: manifest_path,
				})
			}
		};

		let root = serde_json::from_reader::<_, UnvalidatedRootTag>(f)
			.map_err(|source| ClgnDecodingError::JsonDecodeFile {
				source,
				path: manifest_path,
			})?
			.validated()?;

		Ok(root)
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
		writer: &mut quick_xml::Writer<impl std::io::Write>,
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

	fn validated(self) -> ClgnDecodingResult<Self::Validated> {
		let Self {
			inner: Inner { attrs },
			children,
			extras,
		} = self;

		extras.ensure_empty("svg root")?;

		Ok(RootTag {
			inner: Inner { attrs },
			children: children.validated()?,
		})
	}
}
