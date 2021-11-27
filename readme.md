*Collagen* -- from “collage” and “generate” (and because
   [collagen](https://en.wikipedia.org/wiki/Collagen) is the protein that holds your
body together; `s/protein/tool/;s/body/images/`) -- is a program that takes as input
a folder containing zero or more image files (.jpeg, .png, etc.) and a JSON manifest
file describing the layout of these images along with SVG components such as shapes
and text, and produces as output a single SVG file with all assets embedded. It is
designed to allow the coexistence of vector graphics and different kinds of raster
graphics in a single file without the problems that normally arise when attempting to
   combine images with other images of a different format and/or vector graphics, and in
   a format that is supported by most browsers.

Roughly speaking, a manifest file merely describes the components of the resulting SVG
in a way that is simple for humans to read and write. It is up to Collagen to turn this
manifest into an SVG.

## Rationale

There are several widely used image formats, perhaps the three best known of which are
JPEG, PNG, and SVG. JPEG and PNG are [raster
formats](https://en.wikipedia.org/wiki/Raster_graphics), which means they correspond to
a rectangular grid of pixels. On the other hand, SVG is a [vector
format](https://en.wikipedia.org/wiki/Vector_graphics), which means it describes
perfectly precise curves that can be displayed with arbitrarily high precision. These
three formats are each optimized for a different use case:

- [JPEG](https://en.wikipedia.org/wiki/Jpeg) uses lossy compression that preserves
  visual quality on most "real-life" images -- images that contain smoothly-varying
  gradients -- but which produces [visible
  artifacts](https://en.wikipedia.org/wiki/Compression_artifact#Images) when used on
  other kinds of images, especially ones containing hard edges and/or text.
- [PNG](https://en.wikipedia.org/wiki/Portable_Network_Graphics) uses lossless
  compression that handles images with few distinct colors well, but requires an
  inordinate amount of space for storing images with many colors.
- [SVG](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics) is a vector graphics
  format which can nevertheless contain embedded raster images; however, doing so
  requires base64 encoding the raster image.

Because each of these image formats is optimized for only a single use case, they cannot
be easily combined. For instance, overlaying text on a JPEG image will introduce
compression artifacts that were not present in the original text, while overlaying a
JPEG image on a PNG will cause the file size to balloon.

SVG was chosen as the resulting file type for the following reasons:

1. SVGs can indeed store vector graphics and raster images alongside each other
1. SVGs are widely compatible, as most browsers can display them correctly
1. SVGs are "just" a tree of nodes with some attributes, so they're simple to implement
1. SVGs are written in XML, which is simple to write

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

For help getting started and several examples, refer to [this
doc](https://rben01.github.io/collagen). More examples (without explanatory docs) are
available as test cases in `tests/examples`.

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

## FAQ

1. *Wait, so all this does is base64 encode assets and put them in an SVG with other SVG elements?*\
It adds some additional features, such as nesting of skeletons and the use of tag-wide variables and interpolation of these variables in attributes.
But yes, for the most part, all this project does is allow raster images to coexist with each other and with vector graphics.
If you need to embed fonts in an SVG, Collagen lets you do that, too.

1. *Couldn't I just do the base64 encoding and create the SVG myself?*\
Yes.
All Collagen does it automate this.

1. *I want to put some text on a JPEG. What's so bad about just opening an image editor, adding the text, and pressing save?*\
The text will look bad because:
    - It will no be longer an infinitely zoomable vector entity, but instead will have been rasterized, i.e., rendered onto a fixed pixel grid that is only finitely zoomable.
    - JPEG in particular is not optimized for text, so artifacts will be visible (see [here](https://commons.wikimedia.org/w/index.php?title=File:Jpeg-text-artifacts.gif&oldid=453916290) or the Drake meme above).

1. *I'm ok with text being rasterized. This means I can convert my JPEG to PNG and avoid #2 above, right?*\
Yes and no. While the text will look sort of ok (when not zoomed in), you now have the problem that your JPEG is being stored as a PNG.
Chances are that this will cause the resulting file size to explode because PNG is simply not meant to store the kind of images that JPEG is meant to store.
For instance, the JPEG below ([source](https://commons.wikimedia.org/w/index.php?title=File:Planta62.jpg&oldid=424889773)) is 57KB, whereas the PNG is 434KB.\
This JPEG weighs in at 57KB\
![JPEG of flowers with text on top](https://rben01.github.io/collagen/assets/pics/Planta62.jpg)\
The equivalent PNG weighs in at 434KB\
![PNG of flowers with text on top](https://rben01.github.io/collagen/assets/pics/Planta62.jpg)

1. *But surely just placing black text on top of an all-white PNG is fine? Because it's stored losslessly?*\
Sure, _if_ you don't mind your text being rasterized, i.e., not perfectly precise and infinitely zoomable.
The image below is black text on a white background.\
![A screenshot of some text](https://rben01.github.io/collagen/assets/pics/text_png.png)\
You don't have to zoom in very far to see the text get fuzzy.
And if this image undergoes additional rounds of editing and compression, this problem will only get worse.
In contrast, the text in the smiley-face image above (and, naturally, the text on this webpage) is perfectly precise and will retain all of its detail at arbitrary magnification.
