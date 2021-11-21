//! # Collagen
//! Collagen is a program that takes as input a folder containing zero or more image
//! files (.jpeg, .png, etc.) and a JSON manifest file describing the layout of these
//! images along with SVG components such as shapes and text, and produces as output a
//! single SVG file with all assets embedded. It is designed to allow the coexistence of
//! vector graphics and different kinds of raster graphics in a single file without the
//! problems that normally arise when attempting to combine images with other images of
//! a different format and/or vector graphics.
//!
//! SVG was chosen as the resulting file type for the following reasons:
//! 1. SVGs can indeed store vector graphics and raster images alongside each other
//! 1. SVGs are widely compatible, as most browsers can display them correctly
//! 1. SVGs are "just" a tree of nodes with some attributes, so they're simple to
//!    implement
//! 1. SVGs are written in XML, which is simple to write
//!
//! Roughly speaking, a manifest file merely describes the components of the resulting
//! SVG in a way that is simple for humans to read and write. It is up to Collagen to
//! turn this manifest into an SVG.
//!
//! # Using Collagen
//!
//! The input to Collagen is a folder containing, at the bare minimum, a manifest file
//! named `collagen.json`. Such a folder will be refered to as a _skeleton_. A manifest
//! file is more or less a JSON-ified version of an SVG (which is itself XML), with some
//! facilities to make common operations, such as including an image by path, more
//! ergonomic. An example of a valid `collagen.json` file is below:
//!
//! <details><summary>Click to show <code>collagen.json</code></summary>
//!
//! ```javascript
//! {
//!   "vars": {
//!     "bubble_text": "Collagen!!",
//!     "nose_color": "#f00",
//!     "text_color": "#000"
//!   },
//!   "attrs": { "viewBox": "0 0 500 400" },
//!   "children": [
//!     {
//!       "image_path": "images/smiley.jpg",
//!       "attrs": { "transform": "translate(0 100) scale(1.3)" }
//!     },
//!     {
//!       "tag": "circle",
//!       "attrs": {
//!         "cx": 123,
//!         "cy": 240,
//!         "r": 15,
//!         "fill": "{nose_color}",
//!         "stroke": "#000",
//!         "stroke-width": 3
//!       }
//!     },
//!     {
//!       "tag": "path",
//!       "attrs": {
//!         "d": "M 230 140 L 265 120 A 100 40 0 1 0 235 110 Z",
//!         "stroke": "#000",
//!         "stroke-width": 3,
//!         "fill": "#fff"
//!       }
//!     },
//!     {
//!       "tag": "text",
//!       "text": "{bubble_text}",
//!       "attrs": {
//!         "x": 250,
//!         "y": 97,
//!         "text-anchor": "start",
//!         "dominant-baseline": "top",
//!         "font-family": "Impact",
//!         "font-size": 30,
//!         "fill": "{text_color}"
//!       }
//!     }
//!   ]
//! }
//! ```
//!
//! </details>
//!
//! For instance, without Collagen, in order to embed an image of yours in an SVG, you
//! would have to base64-encode it and construct that image tag manually, which would
//! look something like this:
//!
//! ```xml
//! <image href="data:image/png;base64,iVBORw0KGgoAAAA...(many, many bytes omitted)..."></image>
//! ```
//!
//!  In contrast, including an image in a Collagen manifest is as simple as including
//!  the following JSON object as a descendent of the root tag:
//!
//! ```json
//! { "image_path": "path/to/image" }
//! ```
//!
//! Collagen handles base64-encoding the image and constructing the `<image>` tag with
//! the correct attributes
//!
//! An SVG is a tree of nodes, each with a nonnegative number of attributes and child
//! nodes. In general, Collagen deserializes JSON to an in-memory representation, a
//! *fibroblast*, of the image to be constructed  It then serializes this representation
//! into an SVG.
//!
//! # Basic Schema
//!
//!
//!
//! # Organization / Where to Find Things
//!
//! During decoding

pub mod cli;
pub mod fibroblast;
pub mod from_json;
pub mod to_svg;

pub use fibroblast::Fibroblast;
pub use from_json::ClgnDecodingResult;

pub mod assets;
