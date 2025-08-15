# Collagen Schema Documentation

This document defines the schema for Collagen manifest files, serving as the source of truth for both Rust and TypeScript implementations.

## Overview

Collagen manifests describe SVG structures using JSON or Jsonnet. The root object represents an SVG element, and its children can be various tag types that map to SVG elements or special Collagen features.

## Tag Type Detection

Tag types are determined by their **primary key** - a required field that uniquely identifies the tag type:

| Tag Type | Primary Key | Description |
|----------|-------------|-------------|
| GenericTag | `tag` | Generic SVG elements (`<rect>`, `<circle>`, etc.) |
| ImageTag | `image_path` | Embedded images with base64 encoding |
| TextTag | `text` | Raw text content |
| ContainerTag | `clgn_path` | Nested Collagen folder inclusion |
| FontTag | `fonts` | Font embedding with base64 encoding |
| NestedSvgTag | `svg_path` | SVG file inclusion |

## Common Fields

Most tags accept these optional fields:

### `attrs` (optional)
- **Type**: Object with string keys and string/number values
- **Description**: XML attributes for the generated element
- **Example**: `{"fill": "red", "stroke-width": 2}`

### `children` (optional)
- **Type**: Array of child tag objects, or single child tag object
- **Description**: Child elements nested within this tag
- **Note**: Single objects are automatically wrapped in an array

## Tag Types

### GenericTag

Represents any standard SVG element.

**Required Fields:**
- `tag` (string): The SVG tag name (e.g., "rect", "circle", "g")

**Optional Fields:**
- `attrs`: XML attributes
- `children`: Child elements

**Example:**
```json
{
  "tag": "rect",
  "attrs": {
    "x": 10,
    "y": 20,
    "width": 100,
    "height": 50,
    "fill": "blue"
  }
}
```

### ImageTag

Embeds images by base64-encoding them into the SVG.

**Required Fields:**
- `image_path` (string): Path to image file relative to manifest

**Optional Fields:**
- `kind` (string): Image type hint (e.g., "png", "jpg"). If omitted, inferred from file extension
- `attrs`: XML attributes for the `<image>` element
- `children`: Child elements

**Example:**
```json
{
  "image_path": "assets/photo.jpg",
  "attrs": {
    "x": 0,
    "y": 0,
    "width": 200,
    "height": 150
  }
}
```

**Generated Output:**
```xml
<image x="0" y="0" width="200" height="150" href="data:image/jpeg;base64,/9j/4AAQ..."/>
```

### TextTag

Inserts raw text content.

**Required Fields:**
- `text` (string): The text content

**Optional Fields:**
- `is_preescaped` (boolean): If true, text is inserted as pre-escaped XML. Default: false

**Example:**
```json
{
  "text": "Hello, World!"
}
```

**Alternative String Form:**
TextTag can be specified as a plain string:
```json
"Hello, World!"
```

### ContainerTag

Includes another Collagen folder as a nested group. The nested folder's root `<svg>` element becomes a `<g>` element.

**Required Fields:**
- `clgn_path` (string): Path to folder containing nested Collagen manifest

**Optional Fields:**
None (does not accept `attrs` or `children` directly - wrap in a GenericTag if needed)

**Example:**
```json
{
  "clgn_path": "subfolder/nested-project"
}
```

### FontTag

Embeds fonts into the SVG using base64 encoding within a `<defs><style>` block.

**Required Fields:**
- `fonts` (array): Array of FontFace objects

**Optional Fields:**
- `attrs`: XML attributes for the `<defs>` element

**FontFace Object:**

**Required Fields:**
- `name` (string): Font family name for CSS

**Optional Fields:**
- `bundled` (boolean): If true, uses bundled font. Default: false
- `path` (string): Path to .woff2 file (required if `bundled` is false)
- `attrs` (object): Additional CSS properties for @font-face

**Example:**
```json
{
  "fonts": [
    {
      "name": "Impact",
      "bundled": true
    },
    {
      "name": "CustomFont",
      "path": "fonts/custom.woff2",
      "attrs": {
        "font-weight": "bold",
        "font-style": "italic"
      }
    }
  ]
}
```

### NestedSvgTag

Includes an SVG file directly, stripping XML headers and wrapping in a `<g>` element.

**Required Fields:**
- `svg_path` (string): Path to SVG file relative to manifest

**Optional Fields:**
- `attrs`: XML attributes for the wrapper `<g>` element

**Example:**
```json
{
  "svg_path": "assets/icon.svg",
  "attrs": {
    "transform": "scale(2)"
  }
}
```

## Root Tag

The root object in a Collagen manifest represents the SVG root element and has special properties:

**Optional Fields:**
- `attrs`: XML attributes for the `<svg>` element
- `children`: Child elements

**Default Behavior:**
- Automatically adds `xmlns="http://www.w3.org/2000/svg"` if not present
- If no `viewBox` is specified in attrs, the SVG may have unbounded dimensions

**Example:**
```json
{
  "attrs": {
    "viewBox": "0 0 100 100",
    "width": "400",
    "height": "400"
  },
  "children": [
    {
      "tag": "circle",
      "attrs": {
        "cx": "50",
        "cy": "50",
        "r": "40",
        "fill": "red"
      }
    }
  ]
}
```

## Validation Rules

1. **Unique Primary Keys**: Each object must have exactly one primary key
2. **No Extra Fields**: Objects cannot contain unexpected fields beyond their schema
3. **Required Fields**: All required fields for a tag type must be present
4. **Type Validation**: Field values must match expected types
5. **Path Validation**: File paths must be relative (no leading `/`) and exist
6. **Font Validation**: Font objects must specify either `bundled: true` or a `path`

## Error Handling

Common validation errors:

- **UnrecognizedObject**: Object has no valid primary key or multiple primary keys
- **UnexpectedKeys**: Object contains fields not allowed for its tag type
- **MissingRequiredField**: Required field is missing
- **InvalidType**: Field value has wrong type
- **InvalidPath**: File path is invalid or file doesn't exist
- **FontNotFound**: Bundled font name not recognized

## Implementation Notes

- **Rust**: Uses `serde`'s `untagged` deserialization for tag type detection
- **TypeScript**: Uses discriminated unions for type safety
- **Consistency**: Both implementations must produce identical SVG output
- **Extensions**: New tag types require updates to both implementations and this schema