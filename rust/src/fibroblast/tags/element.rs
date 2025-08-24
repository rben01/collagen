use crate::fibroblast::data_types::SimpleValue;
use compact_str::{CompactString, ToCompactString};
use serde::{de::Visitor, Deserialize, Serialize};

/// A type alias for storing XML attribute key-value pairs
#[derive(Debug, Clone)]
pub(crate) struct XmlAttrs(pub(crate) Vec<(CompactString, SimpleValue)>);

impl<'de> Deserialize<'de> for XmlAttrs {
	fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
	where
		D: serde::Deserializer<'de>,
	{
		struct XmlAttrsVisitor;
		impl<'de> Visitor<'de> for XmlAttrsVisitor {
			type Value = XmlAttrs;

			fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
				formatter
					.write_str("a Map<String, VariableValue> or a List<(String, VariableValue)>")
			}

			fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
			where
				A: serde::de::MapAccess<'de>,
			{
				let mut items = Vec::new();
				while let Some((k, v)) = map.next_entry()? {
					items.push((k, v));
				}

				Ok(XmlAttrs(items))
			}

			fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
			where
				A: serde::de::SeqAccess<'de>,
			{
				let mut items = Vec::new();
				while let Some((k, v)) = seq.next_element()? {
					items.push((k, v));
				}

				Ok(XmlAttrs(items))
			}
		}

		deserializer.deserialize_any(XmlAttrsVisitor)
	}
}

impl Serialize for XmlAttrs {
	fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: serde::Serializer,
	{
		serializer.collect_map(self.0.iter().map(|(k, v)| (k, v)))
	}
}

impl XmlAttrs {
	pub(crate) fn iter(&self) -> impl Iterator<Item = (&str, &SimpleValue)> {
		self.0.iter().map(|(k, v)| (k.as_ref(), v))
	}

	fn write_into_impl<'a>(
		items: impl IntoIterator<Item = (&'a str, &'a SimpleValue)>,
		elem: &mut quick_xml::events::BytesStart,
	) {
		for (k, v) in items {
			match v {
				SimpleValue::Text(text) => elem.push_attribute((k, text.as_str())),
				SimpleValue::Number(n) => elem.push_attribute((k, n.to_compact_string().as_str())),
				SimpleValue::IsPresent(true) => elem.push_attribute((k, "")),
				SimpleValue::IsPresent(false) => {}
			}
		}
	}

	#[cfg(not(test))]
	pub(crate) fn write_into(&self, elem: &mut quick_xml::events::BytesStart) {
		Self::write_into_impl(self.iter(), elem);
	}

	// during testing, we sort the attributes so that the order is deterministic (instead
	// of depending on random hash state)
	#[cfg(test)]
	pub(crate) fn write_into(&self, elem: &mut quick_xml::events::BytesStart) {
		let mut items = self.iter().collect::<Vec<_>>();
		items.sort_by_key(|(k, _)| *k);

		Self::write_into_impl(items, elem);
	}
}
