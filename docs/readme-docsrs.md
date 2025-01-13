<div id="header">

# Collagen — The Collage Generator

</div>

<div id="content">

<div id="preamble">

<div class="sectionbody">

<div class="paragraph">

<span class="image"><a href="https://github.com/rben01/collagen" class="image"><img
src="https://img.shields.io/badge/rben01-collagen-_?logo=github"
alt="github" /></a></span>
<span class="image"><a href="https://github.com/rben01/collagen/actions?query=branch%3Amain"
class="image"><img
src="https://img.shields.io/github/actions/workflow/status/rben01/collagen/rust.yml?branch=main&amp;logo=github"
alt="build" /></a></span>
<span class="image"><a href="https://github.com/rben01/collagen/blob/main/LICENSE"
class="image"><img src="https://img.shields.io/crates/l/collagen"
alt="license" /></a></span>
<span class="image"><a href="https://crates.io/crates/collagen" class="image"><img
src="https://img.shields.io/crates/v/collagen.svg?logo=rust"
alt="crates.io" /></a></span>
<span class="image"><a href="https://docs.rs/collagen/latest/collagen/" class="image"><img
src="https://img.shields.io/badge/docs.rs-collagen-1F80C0?logo=docs.rs"
alt="docs.rs" /></a></span>
<span class="image"><a href="https://blog.rust-lang.org/2022/11/03/Rust-1.65.0.html"
class="image"><img
src="https://img.shields.io/crates/msrv/collagen.svg?logo=rust&amp;color=FFC833"
alt="msrv" /></a></span>

</div>

<div id="toc" class="toc">

<div id="toctitle" class="title">

Table of Contents

</div>

- [Quick Start](#quick-start)
- [Introduction](#introduction)
- [Rationale](#rationale)
- [Using Collagen](#using-collagen)
  - [Definitions](#definitions)
  - [In-Depth Description](#in-depth-description)
  - [Basic Schema](#basic-schema)
- [FAQ](#faq)

</div>

</div>

</div>

<div class="sect1">

## Quick Start

<div class="sectionbody">

<div class="paragraph">

Install Collagen with `cargo install collagen`. This will install the
executable `clgn`.

</div>

<div class="paragraph">

Once installed, if you have a manifest file at path
`path/to/folder/collagen.jsonnet` (keep reading to learn what goes in
this manifest), you can run the following command:

</div>

<div class="listingblock">

<div class="content">

``` highlight
clgn -i path/to/folder -o output-file.svg
```

</div>

</div>

<div class="paragraph">

To continuously monitor the input folder and re-run on any changes, you
can run Collagen in watch mode:

</div>

<div class="listingblock">

<div class="content">

``` highlight
clgn -i path/to/folder -o output-file.svg --watch
```

</div>

</div>

<div class="paragraph">

In watch mode, every time a file in `path/to/folder` is modified,
Collagen will attempt to regenerate the output file and will either
print a generic success message or log the specific error encountered,
as the case may be. Watch mode will never terminate on its own. As with
most terminal commands, you can terminate it with
<span class="kbd">Ctrl-C</span>.

</div>

<div class="paragraph">

[This doc](https://rben01.github.io/collagen) has several examples that
can serve as a good starting point for creating a manifest. More
examples are available as test cases in `tests/examples`.

</div>

</div>

</div>

<div class="sect1">

## Introduction

<div class="sectionbody">

<div class="paragraph">

***Collagen*** — from “collage” and “generate” (and because
[collagen](https://en.wikipedia.org/wiki/Collagen) is the protein that
holds your body together; `s/protein/tool/;s/body/images/`) — is a
program that takes as input a folder containing a JSON or
[Jsonnet](https://jsonnet.org/) manifest file that describes the layout
of any number of SVG elements (`<rect>`, `<line>`, `<g>`, etc.), image
files (JPEG, PNG, etc.), other SVGs, and other Collagen folders, and
produces as output a single SVG file with any external assets embedded.
That is, it converts a textual description of an SVG and any provided
assets into a single portable SVG file.

</div>

<div class="paragraph">

JSON is mapped to SVG in a more or less one-to-one fashion, with a few
conveniences thrown in (such as automatically base64-encoding images).
For more programmatic conveniences, it is recommended to use Jsonnet,
which supports the following:

</div>

<div class="ulist">

- Variables

- Arithmetic

- List and object comprehensions (i.e. `for`-loops)

- Conditional logic

- Functions, including

  <div class="ulist">

  - The ability to define and call functions

  - A large standard library of built-in functions

  </div>

- String interpolation

- Imports for code sharing across multiple files

- List and object concatenation/merging

</div>

<div class="paragraph">

For instance, the following manifest will create a rainbow pinwheel.

</div>

`collagen.jsonnet`

<div class="content">

<div class="listingblock">

<div class="content">

``` highlight
local width = 400;
local height = width;
local n_spokes = 16;
local cx = width / 2;
local cy = height / 2;
local spoke_length = width * 0.75;
// this calls a stdlib function (pi is not built in yet)
local pi = std.acos(-1);

{
  attrs: {
    // string interpolation
    viewBox: "0 0 %d %d" % [width, height],
  },
  children: [
    {
      local t = i / n_spokes,
      local theta = t * pi,
      local dx = (spoke_length / 2) * std.cos(theta),
      local dy = (spoke_length / 2) * std.sin(theta),

      tag: "line",
      attrs: {
        x1: cx + dx,
        x2: cx - dx,
        y1: cy + dy,
        y2: cy - dy,
        // we can also build strings by adding them together
        stroke: "hsl(" + std.toString(360 * t) + ", 100%, 50%)",
        "stroke-width": 5,
        "stroke-linecap": "round",
      },
    }
    for i in std.range(0, n_spokes - 1)
  ],
}
```

</div>

</div>

</div>

<div class="paragraph">

<span class="image"><img
src="https://rben01.github.io/collagen/docs/readme/pinwheel/pinwheel.svg"
width="300" alt="A rainbow pinwheel" /></span>

</div>

</div>

</div>

<div class="sect1">

## Rationale

<div class="sectionbody">

<div class="paragraph">

Creating and editing images is hard. Most of the difficulty is due to
lack of programmatic facilities offered by image editing programs.
Collagen aims to fill this gap in the following ways:

</div>

<div class="olist arabic">

1.  Plain text is portable and trivially editable. When editing an image
    is done by editing a text file, the only barrier to entry is knowing
    the format (JSON or Jsonnet), knowing the schema used by Collagen,
    and knowing the catalog of SVG elements. In addition, a folder
    containing a text file and some images is simple to share: just zip
    it and send it along. Finally, Collagen is nondestructive; all
    assets used in the final image are available in their original form
    right in that folder.

2.  While most image editing programs support “guides” and “snapping”
    that allow graphical elements to be precisely positioned relative to
    each other, there is no “glue” to hold the elements together
    indefinitely; moving one tends not to move the other. For instance,
    an arrow pointing from a given corner of a rectangle to a fixed
    point cannot be made to have its tail always lie on that corner
    while leaving its head stationary. Variables solve this problem by
    letting the author use the same variables, and perhaps a little
    arithmetic, to specify the position of both the rectangle’s corner
    and the arrowhead. More generally, variables support the problem of
    keeping several values in sync without having to edit multiple
    hard-coded values.

3.  Image editing programs output a single image file which is of one of
    the well-known image types (JPEG, PNG, etc). Different image formats
    are optimized for different types of image data, and break down when
    made to store image data they weren’t optimized for.

    <div class="olist loweralpha">

    1.  For instance, JPEG is optimized for images with smoothly varying
        gradients (which tends to mean photographs taken by a physical
        camera). Therefore it produces images with ugly compression
        artifacts when made to store geometric shapes or text. Below are
        a PNG image of some text, and that same PNG after conversion to
        JPEG. The JPEG has been enlarged to make the compression
        artifacts more easily visible.

        <div class="openblock">

        <div class="title">

        *A screenshot of the word “Collagen” in PNG format*

        </div>

        <div class="content">

        <div class="paragraph">

        <span class="image"><img
        src="https://rben01.github.io/collagen/docs/readme/jpeg-artifacts/artifacts.png"
        width="300" alt="A screenshot of the word “Collagen” in PNG format" /></span>

        </div>

        </div>

        </div>

        <div class="openblock">

        <div class="title">

        *A screenshot of the word “Collagen” in JPG format, zoomed in*

        </div>

        <div class="content">

        <div class="paragraph">

        <span class="image"><img
        src="https://rben01.github.io/collagen/docs/readme/jpeg-artifacts/artifacts-zoomed.png"
        width="200"
        alt="A screenshot of the word “Collagen” in JPG format zoomed" /></span>

        </div>

        </div>

        </div>

    2.  On the other hand, PNG is optimized for images with long runs of
        few distinct colors, and requires a massive file size to store
        the kind of data that JPEG is optimized for. Despite displaying
        exactly the same image
        ([source](https://commons.wikimedia.org/wiki/File:Cherry_sweet_cherry_red_fruit_167341.jpg)),
        the PNG file below is 6.6 times bigger than the JPEG.

        <div class="openblock">

        <div class="title">

        *A JPEG, weighing in at 407KB*

        </div>

        <div class="content">

        <div class="paragraph">

        <span class="image"><img
        src="https://rben01.github.io/collagen/docs/readme/png-size/Cherry_sweet_cherry_red_fruit_167341-small.jpg"
        width="300" alt="A bunch of cherries" /></span>

        </div>

        </div>

        </div>

        <div class="openblock">

        <div class="title">

        *A PNG, weighing in at 2.7MB*

        </div>

        <div class="content">

        <div class="paragraph">

        <span class="image"><img
        src="https://rben01.github.io/collagen/docs/readme/png-size/Cherry_sweet_cherry_red_fruit_167341-small.png"
        width="300" alt="A bunch of cherries" /></span>

        </div>

        </div>

        </div>

    3.  JPEGs and PNGs are both [raster
        formats](https://en.wikipedia.org/wiki/Raster_graphics), which
        means they correspond to a rectangular grid of pixels. A given
        raster image has a fixed resolution (given in, say, pixels per
        inch), which is, roughly speaking, the amount of detail present
        in the image. When you zoom in far enough on a raster image,
        you’ll be able see the individual pixels that comprise the
        image. Meanwhile, [vector
        graphics](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics)
        store geometric objects such as lines, rectangles, ellipses, and
        even text, which have no resolution to speak of — you can zoom
        infinitely far on them and they’ll always maintain that smooth,
        pixel-perfect appearance. Without Collagen, if you want to, say,
        add some text on top of a JPEG, you have no choice to but to
        rasterize the text, converting the infinitely smooth shapes to a
        grid of pixels and losing the precision inherent in vector
        graphics.

    </div>

    <div class="paragraph">

    Collagen fixes this by allowing JPEGs, PNGs, and any other images
    supported by browsers to coexist with each other and with vector
    graphic elements in an SVG file, leading to neither the loss in
    quality nor the increase in file size that arise when using the
    wrong image format. (Collagen achieves this by simply
    base64-encoding the source images and embedding them directly into
    the SVG.) So you could, for instance, add vector shapes and text on
    top of an raster image without rasterizing them.

    </div>

4.  Creating several similar elements by hand is annoying, and keeping
    them in sync is even worse. Jsonnet supports “list comprehension”,
    aka `for` loops, to programmatically create arbitrary numbers of
    elements, and the children elements can make use of the loop
    variable to control their behavior. We saw this above in the
    pinwheel, which used the loop variable `i` to set the angle and
    color of each spoke. The `for` loop itself had access to the
    `n-spokes` variable set at the beginning of the file, which goes
    back to point 2: variables make things easy.

5.  Why SVG at all? Why not some other output image format?

    <div class="ulist">

    - SVGs can indeed store vector graphics and the different kinds of
      raster images alongside each other.

    - SVGs are supported by nearly every browser and are widely
      supported in general.

    - SVGs are "just" a tree of nodes with some attributes, so they’re
      simple to implement.

    - SVGs are written in XML, which is plain text and simple(-ish) to
      edit.

    </div>

</div>

<div class="paragraph">

The above features make Collagen suitable as an “image editor for
programmers”. Everybody loves memes, programmers included, so let’s use
Collagen to make one.

</div>

`collagen.json`

<div class="content">

<div class="listingblock">

<div class="content">

``` highlight
local width = 800;

{
  vars: { width: 800 },
  attrs: { viewBox: "0 0 %d 650" % width },
  children: [
    {
      tag: "defs",
      children: [
        {
          tag: "style",
          children: {
            text: '@import url("https://my-fonts.pages.dev/Impact/impact.css");',
            is_preescaped: true,
          },
        },
      ],
    },
    {
      image_path: "./drake-small.jpg",
      attrs: {
        width: width,
      },
    },
    {
      local x = 550,
      local dy = 50,

      tag: "text",
      attrs: {
        "font-family": "Impact",
        "font-size": 50,
        color: "black",
        "text-anchor": "middle",
        "vertical-align": "top",
        x: x,
        y: 420,
      },
      children2: [
        {
          tag: "tspan",
          text: [
            "Using SVG-based text,",
            "which is infinitely",
            "zoomable and has",
            "no artifacts",
          ][i],
          attrs: { x: x, dy: if i == 0 then 0 else dy },
        }
        for i in std.range(0, 3)
      ],
    },
  ],
}
```

</div>

</div>

</div>

<div class="paragraph">

<span class="image"><img src="https://rben01.github.io/collagen/docs/readme/drake/drake.svg"
width="400" alt="A Drake meme. Top panel" /></span>

</div>

</div>

</div>

<div class="sect1">

## Using Collagen

<div class="sectionbody">

<div class="sect2">

### Definitions

<div class="hdlist">

|  |  |
|----|----|
| Collagen | The name of this project. |
| `clgn` | The executable that does the conversion to SVG. |
| Manifest | The `collagen.json` or `collagen.jsonnet` file residing at the top level inside a skeleton. If both exist, `collagen.jsonnet` is preferred. |
| Skeleton | A folder that is the input to `clgn`. It must contain a manifest file and any assets specified therein. For instance, if skeleton `` my_skeleton’s manifest contains `{ "image_path": "path/to/image" } ``, then `my_skeleton/path/to/image` must exist. |

</div>

</div>

<div class="sect2">

### In-Depth Description

<div class="paragraph">

The input to Collagen is a folder containing, at the bare minimum, a
*manifest* file named `collagen.json` or `collagen.jsonnet`. Such a
folder will be referred to as a *skeleton*. A manifest file is more or
less a JSON-ified version of an SVG (which is itself XML), with some
facilities to make common operations, such as for loops and including an
image by path, more ergonomic. For instance, without Collagen, in order
to embed an image of yours in an SVG, you would have to base64-encode it
and construct that image tag manually, which would look something like
this:

</div>

<div class="listingblock">

<div class="content">

``` highlight
<image href="data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."></image>
```

</div>

</div>

<div class="paragraph">

In contrast, including an image in a Collagen manifest is as simple as
including the following JSON object as a descendent of the root tag:

</div>

<div class="listingblock">

<div class="content">

``` highlight
{ "image_path": "path/to/image" }
```

</div>

</div>

<div class="paragraph">

Collagen handles base64-encoding the image and constructing the
`<image>` tag with the correct attributes for you.

</div>

</div>

<div class="sect2">

### Basic Schema

<div class="paragraph">

In order to produce an SVG from JSON, Collagen must know how to convert
an object representing a tag into an actual SVG tag, including
performing any additional work (such as base64-encoding an image).
Collagen identifies the type of an object it deserializes simply by the
keys it contains. For instance, the presence of the `"image_path"`
property tells Collagen that this tag is an `<image>` tag with an
associated image file to embed. To avoid ambiguities, it is an error for
an object to contain unexpected keys.

</div>

<div class="paragraph">

Tags are listed at
[docs.rs/collagen](https://docs.rs/collagen/latest/collagen/fibroblast/tags/enum.AnyChildTag.html).

</div>

</div>

</div>

</div>

<div class="sect1">

## FAQ

<div class="sectionbody">

<div class="qlist qanda">

1.  *How is this different from a templating language like
    [Liquid](https://shopify.github.io/liquid/)?*

    Templating languages generally consist of two components: the
    templating library, which does the rendering of the template, and
    the template language, which usually resembles HTML with the
    addition of things like control flow and interpolation. The library
    is responsible for combining a template file and *some external
    data* and turning them into an output file. But you can’t
    (generally) write your data literally in the template file, which is
    inconvenient, and the overhead of needing to write down your data
    separately can be quite large compared to the complexity of the
    image you would use Collagen to create. In addition, to actually
    drive the templating library probably requires writing some code in
    the library’s language and running it in the language’s runtime.

    <div class="paragraph">

    In contrast, Collagen lets you include data directly in the manifest
    and runs via single executable with no runtime to speak of. It also
    lets you write your image in a single file (the manifest) instead of
    two (the template file and the “real code” that creates the output.)
    In addition, with Collagen, there is no syntax to learn, per se; you
    simply write JSON or Jsonnet.

    </div>

2.  *How does Collagen handle paths across multiple platforms?*

    In general, filesystem paths are not necessarily valid UTF-8
    strings. Furthermore, Windows and \*nix systems use different path
    separators. How, then, does Collagen handle paths to files on disk
    in a platform-agnostic way? All paths consumed by Collagen must be
    valid UTF-8 strings using forward slashes (`/`) as the path
    separator. Forward slashes are replaced with the system path
    separator before resolving the path. So `path/to/image` remains
    unchanged on \*nix systems, but becomes `path\to\image` on Windows.
    This means that in order to be portable, path components should not
    contain the path separator of any system, even if it is legal on the
    system on which the skeleton is authored. For instance, filenames
    with backslashes `\` are legal on Linux, but would pose a problem
    when decoding on Windows. Generally speaking, if you restrict your
    file and folder names to use word characters, hyphens, whitespace,
    and a limited set of punctuation, you should be fine.

    <div class="paragraph">

    Naturally you are also limited by the inherent system limitations on
    path names. For instance, while `CON` is a valid filename on Linux,
    it is forbidden by Windows. Collagen makes no effort to do filename
    validation on behalf of systems on which it may be used; it is up to
    the author of a skeleton to ensure that it can be decoded on a
    target device.

    </div>

</div>

</div>

</div>

</div>
