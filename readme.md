# Readme

*Just want to get up and running with `clgn`? Refer to [this
doc](https://rben01.github.io/collagen/), which has plenty of examples.*

Collagen is a program that takes as input a folder containing zero or more image files
(.jpeg, .png, etc.) and a JSON manifest file describing the layout of these images along
with SVG components such as shapes and text, and produces as output a single SVG file
with all assets embedded. It is designed to allow the coexistence of vector graphics and
different kinds of raster graphics in a single file without the problems that normally
arise when attempting to combine images with other images of a different format and/or
vector graphics.

SVG was chosen as the resulting file type for the following reasons:

1. SVGs can indeed store vector graphics and raster images alongside each other
1. SVGs are widely compatible, as most browsers can display them correctly
1. SVGs are "just" a tree of nodes with some attributes, so they're simple to implement
1. SVGs are written in XML, which is simple to write

Roughly speaking, a manifest file merely describes the components of the resulting SVG
in a way that is simple for humans to read and write. It is up to Collagen to turn this
manifest into an SVG.

## Definitions

- *Collagen*: The name of this project.
- *`clgn`*: The executable that does the conversion to SVG.
- *Skeleton*: A folder that is the input to `clgn`. It must contain a `collagen.json`
  file and any assets specified by `collagen.json`. For instance, if skeleton
  `my_collagen`'s `collagen.json` contains `{ "image_path": "path/to/image" }`, then
  `my_collage/path/to/image` must exist.
- *Manifest*: The `collagen.json` file residing at the top level inside a skeleton.

## Using Collagen

The input to Collagen is a folder containing, at the bare minimum, a *manifest* file
named `collagen.json`. Such a folder will be referred to as a *skeleton*. A manifest
file is more or less a JSON-ified version of an SVG (which is itself XML), with some
facilities to make common operations, such as including an image by path, more
ergonomic. For instance, without Collagen, in order to embed an image of yours in an
SVG, you would have to base64-encode it and construct that image tag manually, which
would look something like this:

```xml
<image href="data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."></image>
```

 In contrast, including an image in a Collagen manifest is as simple as including the
 following JSON object as a descendent of the root tag:

```json
{ "image_path": "path/to/image" }
```

Collagen handles base64-encoding the image and constructing the `<image>` tag with the
correct attributes.

Examples of skeletons can be found in `tests/examples`. This is a great starting point
to grok the basic syntax.

## Basic Schema

In order to produce an SVG from JSON, Collagen must know how to convert an object
representing a tag into an actual SVG tag, including performing any additional work
(such as base64-encoding an image). Collagen identifies the type of an object it
deserializes simply by the keys it contains. For instance, the presence of the
`"image_path"` property alone tells Collagen that this tag is an `<image>` tag with an
associated image file to embed. To avoid ambiguities, it is an error for an object to
contain unexpected keys.

All recognized tags are listed in [`crate::fibroblast::tags`]. Each tag there documents
its schema.

## Organization / Where to Find Things

TODO
