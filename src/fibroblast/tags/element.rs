use std::{borrow::Cow, marker::PhantomData};

use super::{AnyChildTag, DecodingContext, TagVariables};
use crate::{fibroblast::data_types::XmlAttrsBorrowed, ClgnDecodingResult};

pub(crate) trait HasVars {
	fn vars(&self) -> &TagVariables;
}

pub(crate) trait HasOwnedVars {
	fn vars_mut(&mut self) -> &mut Option<TagVariables>;
}

pub(crate) struct NodeGenerator<'a, 'b> {
	pub(crate) children: Cow<'b, [AnyChildTag<'a>]>,
}

pub(crate) trait AsNodeGenerator<'a> {
	fn children<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>>;

	fn as_node_gtor<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<NodeGenerator<'a, 'b>> {
		let children = self.children(context)?;
		Ok(NodeGenerator { children })
	}
}

pub(crate) struct SvgElement<'a, 'b> {
	pub(crate) name: &'b str,
	pub(crate) attrs: XmlAttrsBorrowed<'b>,
	pub(crate) children: Cow<'b, [AnyChildTag<'a>]>,
}

pub(crate) trait AsSvgElement<'a> {
	fn tag_name(&self) -> &str;

	fn attrs<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<XmlAttrsBorrowed<'b>>;

	fn children<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'b, [AnyChildTag<'a>]>>;

	fn as_svg_elem<'b>(
		&'b self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<SvgElement<'a, 'b>> {
		let name = self.tag_name();
		let attrs = self.attrs(context)?;
		let children = self.children(context)?;
		Ok(SvgElement {
			name,
			attrs,
			children,
		})
	}
}

pub(crate) struct TextNode<'a, 'b> {
	pub(crate) text: Cow<'b, str>,
	pub(crate) is_preescaped: bool,
	phantom: PhantomData<&'a ()>,
}

pub(crate) trait AsTextNode<'a> {
	fn raw_text<'b>(&'b self, context: &DecodingContext) -> ClgnDecodingResult<Cow<'b, str>>;
	fn is_preescaped(&self, context: &DecodingContext) -> ClgnDecodingResult<bool>;

	fn as_text_node<'b>(
		&'b self,
		context: &DecodingContext,
	) -> ClgnDecodingResult<TextNode<'a, 'b>> {
		let text = self.raw_text(context)?;
		let is_preescaped = self.is_preescaped(context)?;

		Ok(TextNode {
			text,
			is_preescaped,
			phantom: PhantomData,
		})
	}
}

pub(crate) enum Node<'a, 'b> {
	Element(SvgElement<'a, 'b>),
	Generator(NodeGenerator<'a, 'b>),
	Text(TextNode<'a, 'b>),
}

impl<'a, 'b> From<SvgElement<'a, 'b>> for Node<'a, 'b> {
	fn from(value: SvgElement<'a, 'b>) -> Self {
		Self::Element(value)
	}
}

impl<'a, 'b> From<NodeGenerator<'a, 'b>> for Node<'a, 'b> {
	fn from(value: NodeGenerator<'a, 'b>) -> Self {
		Self::Generator(value)
	}
}

impl<'a, 'b> From<TextNode<'a, 'b>> for Node<'a, 'b> {
	fn from(value: TextNode<'a, 'b>) -> Self {
		Self::Text(value)
	}
}
