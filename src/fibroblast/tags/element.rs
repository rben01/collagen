use std::borrow::Cow;

use super::{
	AnyChildTag, ContainerTag, DecodingContext, FontTag, ForeachTag, GenericTag, IfTag, ImageTag,
	NestedSvgTag, TagVariables,
};
use crate::{fibroblast::data_types::XmlAttrsBorrowed, ClgnDecodingResult};

pub(crate) trait HasVars {
	fn vars(&self, context: &DecodingContext) -> ClgnDecodingResult<&TagVariables>;
}

pub(crate) trait HasOwnedVars {
	fn vars_mut(&self) -> &mut Option<TagVariables>;
}

// pub(crate) enum DeTag<'a> {
// 	Generic(GenericTag<'a>),
// 	Image(ImageTag<'a>),
// 	Container(ContainerTag<'a>),
// 	NestedSvg(NestedSvgTag<'a>),
// 	Foreach(ForeachTag<'a>),
// 	If(IfTag<'a>),
// 	Font(FontTag),
// }

pub(crate) struct NodeGenerator<'a> {
	children: Cow<'a, [AnyChildTag<'a>]>,
}

pub(crate) trait AsNodeGenerator<'a>: HasVars {
	fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, [AnyChildTag<'a>]>>;

	fn as_node_gtor(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<NodeGenerator<'a>> {
		let children = self.children(context)?;
		Ok(NodeGenerator { children })
	}
}

pub(crate) struct SvgElement<'a> {
	name: &'static str,
	attrs: XmlAttrsBorrowed<'a>,
	children: Cow<'a, [AnyChildTag<'a>]>,
}

pub(crate) trait AsSvgElement<'a>: HasVars {
	fn tag_name(&self) -> &'static str;
	fn attrs(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<XmlAttrsBorrowed<'a>>;
	fn children(
		&'a self,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<Cow<'a, [AnyChildTag<'a>]>>;

	fn as_tag(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<SvgElement<'a>> {
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

pub(crate) struct TextNode<'a> {
	text: Cow<'a, str>,
	is_preescaped: bool,
}

impl<'a> TextNode<'a> {
	fn new<T: AsTextNode<'a>>(
		t: T,
		context: &DecodingContext<'a>,
	) -> ClgnDecodingResult<TextNode<'a>> {
		let text = t.text(context)?;
		let is_preescaped = t.is_preescaped(context)?;
		Ok(Self {
			text,
			is_preescaped,
		})
	}
}

pub(crate) trait AsTextNode<'a>: HasVars {
	fn text(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<Cow<'a, str>>;
	fn is_preescaped(&self, context: &DecodingContext) -> ClgnDecodingResult<bool>;

	fn as_text_node(&'a self, context: &DecodingContext<'a>) -> ClgnDecodingResult<TextNode<'a>> {
		let text = self.text(context)?;
		let is_preescaped = self.is_preescaped(context)?;

		Ok(TextNode {
			text,
			is_preescaped,
		})
	}
}

pub(crate) enum Node<'a> {
	Element(SvgElement<'a>),
	Generator(NodeGenerator<'a>),
	Text(TextNode<'a>),
}

impl<'a> From<SvgElement<'a>> for Node<'a> {
	fn from(value: SvgElement<'a>) -> Self {
		Self::Element(value)
	}
}

impl<'a> From<NodeGenerator<'a>> for Node<'a> {
	fn from(value: NodeGenerator<'a>) -> Self {
		Self::Generator(value)
	}
}

impl<'a> From<TextNode<'a>> for Node<'a> {
	fn from(value: TextNode<'a>) -> Self {
		Self::Text(value)
	}
}

pub(crate) struct Tag<'a> {
	vars: &'a TagVariables,
	node: Node<'a>,
}
