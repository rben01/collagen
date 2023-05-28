![collagen](https://img.shields.io/crates/v/collagen)

***Collagen*** — from “collage” and “generate” (and because
[collagen](https://en.wikipedia.org/wiki/Collagen) is the protein that
holds your body together; `s/protein/tool/;s/body/images/`) — is a
program that takes as input a folder containing a JSON manifest file
that describes the layout of any number of SVG elements (`<rect>`,
`<line>`, `<g>`, etc.), image files (JPEG, PNG, etc.), other SVGs, and
other Collagen folders, and produces as output a single SVG file with
any external assets embedded. That is, it converts a textual description
of an SVG and any provided assets into a single portable SVG file.

In addition to mapping the manifest directly into SVG, Collagen supports
a number of features that make creating graphics more convenient for the
author, such as variable assignment and interpolation into SVG
attributes, a LISP-like language to evaluate mathematical expressions
inside strings, “if” tags to conditionally generate elements, and
“for-each” tags to generate sequences of elements. For instance, the
following manifest will create a rainbow pinwheel.

    {
        "vars": {
            "width": 100,
            "height": "{width}",
            "n-spokes": 5,
            "cx": "{(/ width 2)}",
            "cy": "{(/ height 2)}",
            "spoke-length": "{(* width 0.75)}"
        },
        "attrs": {
            "viewBox": "0 0 {width} {height}"
        },
        "children": [
            {
                "for_each": {
                    "variable": "i",
                    "in": { "start": 0, "end": "{n-spokes}" }
                },
                "do": {
                    "tag": "line",
                    "vars": {
                        "theta": "{(* (/ i n-spokes) (pi))}",
                        "dx": "{(* (/ spoke-length 2) (cos theta))}",
                        "dy": "{(* (/ spoke-length 2) (sin theta))}"
                    },
                    "attrs": {
                        "x1": "{(+ cx dx)}",
                        "x2": "{(- cx dx)}",
                        "y1": "{(+ cy dy)}",
                        "y2": "{(- cy dy)}",
                        "stroke": "hsl\\({(* (/ i n-spokes) 360)}, 100%, 50%\\)"
                    }
                }
            }
        ]
    }

![A rainbow pinwheel](examples/pinwheel/pinwheel.svg)

# Rationale

Creating and editing images is hard. Most of the difficulty is due to
lack of programmatic facilities offered by image editing programs. (I
must caveat this by admitting I have not used every graphics editing
program on the market. But the ones I have tried fall short.) Collagen
aims to fill this gap in the following ways:

1.  Plain text is portable and trivially editable. When editing an image
    is done by editing a text file, the only barrier to entry is knowing
    JSON, knowing the schema used by Collagen, and knowing the catalog
    of SVG elements. In addition, a folder containing a text file and
    some images is simple to share: just zip it and send it along.
    Finally, Collagen is nondestructive; all assets used in the final
    image are available in their original form right in that folder.

2.  While most image editing programs support “guides” and “snapping”
    that allow graphical elements to be precisely positioned relative to
    each other, there is no “glue” to hold the elements together
    indefinitely; moving one tends not to move the other. For instance,
    an arrow pointing from a given corner of a rectangle to a fixed
    point cannot be made to have its tail always lie on that corner
    while leaving its head stationary. Variables solve this problem by
    letting the author use the same variable(s) to specify the position
    of both the rectangle’s corner and the arrowhead. More generally,
    variables support the problem of keeping several values in sync
    without having to edit multiple hard-coded values.

3.  Image editing programs output a single image file which is of one of
    the well-known image types (JPEG, PNG, etc). Different image formats
    are optimized for different types of image data, and break down when
    made to store image data they weren’t optimized for.

    1.  For instance, JPEG is optimized for images with smoothly varying
        gradients (which tends to mean photographs taken by a physical
        camera). Therefore it produces images with ugly compression
        artifacts when made to store geometric shapes or text. Below are
        a PNG image of some text, and that same PNG after conversion to
        JPEG. The JPEG has been enlarged to make the compression
        artifacts more easily visible.

        ![A screenshot of the word “Collagen” in PNG
        format](examples/jpeg-artifacts/artifacts.png)

        ![A screenshot of the word “Collagen” in JPG format, zoomed
        in](examples/jpeg-artifacts/artifacts-zoomed.png)

    2.  On the other hand, PNG is optimized for images with long runs of
        few distinct colors, and requires a massive file size to store
        the kind of data that JPEG is optimized for. Despite displaying
        exactly the same image
        ([source](https://commons.wikimedia.org/wiki/File:Cherry_sweet_cherry_red_fruit_167341.jpg)),
        the PNG file below is 6.6 times bigger than the JPEG.

        ![A JPEG, weighing in at
        407KB](examples/png-size/Cherry_sweet_cherry_red_fruit_167341-small.jpg)

        ![A PNG, weighing in at
        2.7MB](examples/png-size/Cherry_sweet_cherry_red_fruit_167341-small.png)

    3.  JPEGs and PNGs are both [raster
        formats](https://en.wikipedia.org/wiki/Raster_graphics), which
        means they correspond to a rectangular grid of pixels. A given
        raster image has a fixed resolution (given in, say, pixels per
        inch), which is, roughly speaking, the amount of detail present
        in the image. When you zoom in far enough on a raster image,
        you’ll be able see the individual pixels that comprise the
        image. Meanwhile, [veector
        graphics](https://en.wikipedia.org/wiki/Scalable_Vector_Graphics)
        store geometric objects such as lines, rectangles, ellipses, and
        even text, which have no resolution to speak of — you can zoom
        infinitely far on them and they’ll always maintain that smooth,
        pixel-perfect appearance. Without Collagen, if you want to, say,
        add some text on top of a JPEG, you have no choice to but to
        rasterize the text, converting the infinitely smooth shapes to a
        grid of pixels and losing the precision inherent in vector
        graphics.

    Collagen fixes this by allowing JPEGs, PNGs, and any other images
    supported by browsers to coexist with each other and with vector
    graphic elements in an SVG file, leading to neither the loss in
    quality nor the increase in file size that arise when using the
    wrong image format. (Collagen achieves this by simply
    base64-encoding the source images and embedding them directly into
    the SVG.)

4.  Creating several similar elements by hand is annoying, and keeping
    them in sync is even worse. Collagen provides a `for_each` tag to
    programmatically create arbitrary numbers of elements, and the
    children elements can make use of the loop variable to control their
    behavior. We saw this above in the pinwheel, which used the loop
    variable `i` to set the angle and color of each spoke. The `for`
    loop itself had access to the `n-spokes` variable set at the
    beginning of the file, which goes back to point 1: variables make
    things easy.

5.  Why SVG at all? Why not some other output image format?

    -   SVGs can indeed store vector graphics and the different kinds of
        raster images alongside each other.

    -   SVGs are widely compatible, as they’re supported by nearly every
        browser.

    -   SVGs are "just" a tree of nodes with some attributes, so they’re
        simple to implement.

    -   SVGs are written in XML, which is plain text and simple(-ish) to
        edit.

The above features make Collagen suitable as an “image editor for
programmers”.

# Using Collagen

## Quick Start

Install Collagen with `cargo install collagen`. This will install the
executable `clgn`.

Once installed, if you have a manifest file at path
`path/to/collagen/manifest.json`, you can run the following command:

    clgn -i path/to/collagen -o output-file.svg

[This doc](https://rben01.github.io/collagen) has several examples that
can serve as a good starting point for creating a manifest. More
examples are available as test cases in `tests/examples`.

## Definitions

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 85%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>Collagen</p></td>
<td><p>The name of this project.</p></td>
</tr>
<tr class="even">
<td><p><code>clgn</code></p></td>
<td><p>The executable that does the conversion to SVG.</p></td>
</tr>
<tr class="odd">
<td><p>Skeleton</p></td>
<td><p>A folder that is the input to <code>clgn</code>. It must contain
a <code>collagen.json</code> file and any assets specified by
<code>collagen.json</code>. For instance, if skeleton
<code>my_skeleton’s `collagen.json</code> contains
<code>{ "image_path": "path/to/image" }</code>, then
<code>my_skeleton/path/to/image</code> must exist.</p></td>
</tr>
<tr class="even">
<td><p>Manifest</p></td>
<td><p>The <code>collagen.json</code> file residing at the top level
inside a skeleton.</p></td>
</tr>
</tbody>
</table>

## In-Depth Description

The input to Collagen is a folder containing, at the bare minimum, a
*manifest* file named `collagen.json`. Such a folder will be referred to
as a *skeleton*. A manifest file is more or less a JSON-ified version of
an SVG (which is itself XML), with some facilities to make common
operations, such as for loops and including an image by path, more
ergonomic. For instance, without Collagen, in order to embed an image of
yours in an SVG, you would have to base64-encode it and construct that
image tag manually, which would look something like this:

    <image href="data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."></image>

In contrast, including an image in a Collagen manifest is as simple as
including the following JSON object as a descendent of the root tag:

    { "image_path": "path/to/image" }

Collagen handles base64-encoding the image and constructing the
`<image>` tag with the correct attributes for you.

## Basic Schema

In order to produce an SVG from JSON, Collagen must know how to convert
an object representing a tag into an actual SVG tag, including
performing any additional work (such as base64-encoding an image).
Collagen identifies the type of an object it deserializes simply by the
keys it contains. For instance, the presence of the `"for_each"`
property tells Collagen that this tag is a `for` loop tag, while the
`"image_path"` property tells Collagen that this tag is an `<image>` tag
with an associated image file to embed. To avoid ambiguities, it is an
error for an object to contain unexpected keys.

The recognized tags are listed at
[docs.rs/collagen](https://docs.rs/collagen/latest/collagen/fibroblast/tags/enum.AnyChildTag.html).

# Portability Concerns

In general, filesystem paths are not necessarily valid UTF-8 strings.
Furthermore, Windows and \\\*nix systems use different path separators.
How, then, does Collagen handle paths to files on disk in a
platform-agnostic way? All paths consumed by Collagen must be valid
UTF-8 strings using forward slashes (`/`) as the path separator. Forward
slashes are replaced with the system path separator before resolving the
path. So `path/to/image` remains unchanged on \\\*nix systems, but
becomes `path\to\image` on Windows. This means that in order to be
portable, path components should not contain the path separator of any
system, even if it is legal on the system on which the skeleton is
authored. For instance, filenames with backslashes `\` are legal on
Linux, but would pose a problem when decoding on Windows. Generally
speaking, if you restrict your file and folder names to use word
characters, hyphens, whitespace, and a limited set of punctuation, you
should be fine.

Naturally you are also limited by the inherent system limitations on
path names. For instance, while `CON` is a valid filename on Linux, it
is forbidden by Windows. Collagen makes no effort to do filename
validation on behalf of systems on which it may be used; it is up to the
author of a skeleton to ensure that it can be decoded on a target
device.
