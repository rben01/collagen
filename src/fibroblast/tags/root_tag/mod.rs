use super::{
	error_tag::Validatable, AnyChildTag, ClgnDecodingResult, DeChildTags, DeXmlAttrs,
	DecodingContext, XmlAttrs,
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
///
/// `RootTag` accepts only the properties in [`CommonTagFields`](crate::fibroblast::tags::CommonTagFields).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootTag {
	#[serde(flatten)]
	attrs: DeXmlAttrs,

	#[serde(flatten)]
	children: DeChildTags,
}

impl RootTag {
	pub(crate) fn new_from_dir_with_jsonnet(path: &Path) -> ClgnDecodingResult<Self> {
		let manifest_path = path.join("collagen.jsonnet");

		let mut vm = JsonnetVm::new();
		let json_str = match vm.evaluate_file(path) {
			Ok(s) => s,
			Err(err) => {
				return Err(ClgnDecodingError::JsonnetRead {
					msg: err.to_string(),
					path: manifest_path,
				})
			}
		};

		let root = serde_json::from_str::<RootTag>(&json_str)
			.map_err(|source| ClgnDecodingError::JsonDecode {
				source,
				path: manifest_path,
			})?
			.validate()?;

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

		let root = serde_json::from_reader::<_, RootTag>(f)
			.map_err(|source| ClgnDecodingError::JsonDecode {
				source,
				path: manifest_path,
			})?
			.validate()?;

		Ok(root)
	}

	pub(crate) fn attrs(&self) -> &XmlAttrs {
		self.attrs.as_ref()
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
				let attrs = self.attrs.as_ref();

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

impl RootTag {
	pub(crate) fn validate(mut self) -> ClgnDecodingResult<Self> {
		let children = self.children.children.take();
		let Some(children) = children else {
			return Ok(self);
		};
		self.children = DeChildTags {
			children: Some(
				children
					.into_iter()
					.map(|child| child.validate())
					.collect::<ClgnDecodingResult<Vec<_>>>()?,
			),
		};

		Ok(self)
	}
}
