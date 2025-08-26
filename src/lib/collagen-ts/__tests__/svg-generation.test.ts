/**
 * Comprehensive tests for the SVG generation module
 *
 * Tests XML generation, attribute handling, image embedding,
 * font processing, and complex SVG structures.
 */

import { describe, it, expect } from "vitest";
import {
  createFileFromBytes,
  generateSvgFromFiles,
  TEST_FONT_WOFF2,
} from "./test-utils.js";

// =============================================================================
// Test Utilities
// =============================================================================

/** Helper to validate and generate SVG from JSON */
async function generateSvgFromJson(
  json: any,
  files: Record<string, string | Uint8Array | File> = {},
): Promise<string> {
  const allFiles = { "collagen.json": JSON.stringify(json), ...files };
  return await generateSvgFromFiles(allFiles);
}

/** Test helper to parse base64 data from data URI */
function parseBase64DataUri(dataUri: string): {
  mimeType: string;
  data: string;
} {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error(`Invalid data URI: ${dataUri}`);
  }
  return { mimeType: match[1], data: match[2] };
}

// =============================================================================
// Basic SVG Generation Tests
// =============================================================================

describe("Basic SVG Generation", () => {
  it("should generate empty SVG", async () => {
    const svg = await generateSvgFromJson({});
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it("should generate SVG with attributes", async () => {
    const svg = await generateSvgFromJson({
      attrs: { viewBox: "0 0 100 100", width: 100, height: 100 },
    });
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="100"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("should preserve existing xmlns attribute", async () => {
    const svg = await generateSvgFromJson({
      attrs: {
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
      },
    });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  it("should handle empty children array", async () => {
    const svg = await generateSvgFromJson({ children: [] });
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });
});

// =============================================================================
// Generic Tag Tests
// =============================================================================

describe("Generic Tag Generation", () => {
  it("should generate simple generic tags", async () => {
    const svg = await generateSvgFromJson({
      children: [
        { tag: "rect", attrs: { x: 0, y: 0, width: 50, height: 50 } },
        { tag: "circle", attrs: { cx: 25, cy: 25, r: 10 } },
      ],
    });

    expect(svg).toContain('<rect x="0" y="0" width="50" height="50"/>');
    expect(svg).toContain('<circle cx="25" cy="25" r="10"/>');
  });

  it("should handle self-closing tags correctly", async () => {
    const svg = await generateSvgFromJson({
      children: [
        { tag: "rect" }, // self-closing when empty
        { tag: "g" }, // not self-closing
      ],
    });

    expect(svg).toContain("<rect/>");
    expect(svg).toContain("<g></g>");
  });

  it("should generate nested generic tags", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "g",
          attrs: { transform: "translate(10,10)" },
          children: [
            { tag: "circle", attrs: { cx: 0, cy: 0, r: 5 } },
            {
              tag: "g",
              attrs: { opacity: "0.5" },
              children: [
                {
                  tag: "rect",
                  attrs: { x: -2, y: -2, width: 4, height: 4 },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(svg).toContain('<g transform="translate(10,10)">');
    expect(svg).toContain('<circle cx="0" cy="0" r="5"/>');
    expect(svg).toContain('<g opacity="0.5">');
    expect(svg).toContain('<rect x="-2" y="-2" width="4" height="4"/>');
    expect(svg).toContain("</g></g>");
  });

  it("should handle empty tag names", async () => {
    const svg = await generateSvgFromJson({
      children: [{ tag: "", attrs: { x: 0 } }],
    });

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(svg).toContain("</>");
  });
});

// =============================================================================
// Text Tag Tests
// =============================================================================

describe("Text Tag Generation", () => {
  it("should generate text from string", async () => {
    const svg = await generateSvgFromJson({ children: ["Hello, World!"] });

    expect(svg).toContain("Hello, World!");
  });

  it("should generate text from object", async () => {
    const svg = await generateSvgFromJson({
      children: [{ text: "Hello from object!" }],
    });

    expect(svg).toContain("Hello from object!");
  });

  it("should escape XML characters in text", async () => {
    const svg = await generateSvgFromJson({
      children: ["Text with <tags> & \"quotes\" and 'apostrophes'"],
    });

    expect(svg).toContain(
      "Text with &lt;tags&gt; &amp; &quot;quotes&quot; and &#39;apostrophes&#39;",
    );
  });

  it("should handle preescaped text", async () => {
    const svg = await generateSvgFromJson({
      children: [{ text: "<b>Bold</b> & <i>italic</i>", is_preescaped: true }],
    });

    expect(svg).toContain("<b>Bold</b> & <i>italic</i>");
  });

  it("should handle empty text", async () => {
    const svg = await generateSvgFromJson({ children: ["", { text: "" }] });

    // Empty text should still be present but not visible
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it("should handle unicode text", async () => {
    const unicode = "🌍 Hello 中文 العربية";
    const svg = await generateSvgFromJson({ children: [unicode] });

    expect(svg).toContain(unicode);
  });

  it("should handle mixed text and tags", async () => {
    const svg = await generateSvgFromJson({
      children: [
        "Start text",
        { tag: "rect", attrs: { x: 0, y: 0, width: 10, height: 10 } },
        "Middle text",
        { text: "Object text" },
        "End text",
      ],
    });

    expect(svg).toContain("Start text");
    expect(svg).toContain("Middle text");
    expect(svg).toContain("Object text");
    expect(svg).toContain("End text");
    expect(svg).toContain('<rect x="0" y="0" width="10" height="10"/>');
  });
});

// =============================================================================
// Attribute Handling Tests
// =============================================================================

describe("XML Attribute Handling", () => {
  it("should write string attributes", async () => {
    const svg = await generateSvgFromJson({
      children: [{ tag: "rect", attrs: { fill: "red", stroke: "blue" } }],
    });

    expect(svg).toContain('fill="red"');
    expect(svg).toContain('stroke="blue"');
  });

  it("should write numeric attributes", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "circle",
          attrs: { cx: 50, cy: 25.5, r: 10, "stroke-width": 2.0 },
        },
      ],
    });

    expect(svg).toContain('cx="50"');
    expect(svg).toContain('cy="25.5"');
    expect(svg).toContain('r="10"');
    expect(svg).toContain('stroke-width="2"');
  });

  it("should escape special characters in attributes", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "text",
          attrs: {
            "data-content": "Hello & <World> \"test\" 'quote'",
            x: 10,
          },
        },
      ],
    });

    expect(svg).toContain(
      'data-content="Hello &amp; &lt;World&gt; &quot;test&quot; &#39;quote&#39;"',
    );
  });

  it("should handle attributes with hyphens and special characters", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "rect",
          attrs: {
            "stroke-dasharray": "5,5",
            "font-family": "Arial, sans-serif",
            "xml:lang": "en",
          },
        },
      ],
    });

    expect(svg).toContain('stroke-dasharray="5,5"');
    expect(svg).toContain('font-family="Arial, sans-serif"');
    expect(svg).toContain('xml:lang="en"');
  });

  it("should handle empty attribute values", async () => {
    const svg = await generateSvgFromJson({
      children: [{ tag: "rect", attrs: { fill: "", stroke: "none" } }],
    });

    expect(svg).toContain('fill=""');
    expect(svg).toContain('stroke="none"');
  });

  it("should handle zero values", async () => {
    const svg = await generateSvgFromJson({
      children: [{ tag: "rect", attrs: { x: 0, y: 0, opacity: 0 } }],
    });

    expect(svg).toContain('x="0"');
    expect(svg).toContain('y="0"');
    expect(svg).toContain('opacity="0"');
  });
});

// =============================================================================
// Image Tag Tests
// =============================================================================

describe("Image Tag Generation", () => {
  it("should embed JPEG image as base64", async () => {
    const jpegData = [0xff, 0xd8, 0xff, 0xe0]; // JPEG magic bytes
    const files = {
      "photo.jpg": createFileFromBytes(
        new Uint8Array(jpegData),
        "photo.jpg",
        "image/jpeg",
      ),
    };

    const svg = await generateSvgFromJson(
      { children: [{ image_path: "photo.jpg" }] },
      files,
    );

    expect(svg).toContain('<image href="data:image/jpeg;base64,');
    expect(svg).toContain('"/>');

    // Verify base64 encoding
    const match = svg.match(/href="(data:image\/jpeg;base64,[^"]+)"/);
    expect(match).toBeTruthy();

    const { mimeType, data } = parseBase64DataUri(match![1]);
    expect(mimeType).toBe("image/jpeg");

    // Decode and verify data
    const decoded = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(jpegData);
  });

  it("should embed PNG image with attributes", async () => {
    const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const files = {
      "icon.png": createFileFromBytes(pngData, "icon.png", "image/png"),
    };

    const svg = await generateSvgFromJson(
      {
        children: [
          {
            image_path: "icon.png",
            attrs: { width: 32, height: 32, x: 10, y: 10 },
          },
        ],
      },
      files,
    );

    expect(svg).toContain("<image");
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('x="10"');
    expect(svg).toContain('y="10"');
    expect(svg).toContain('href="data:image/png;base64,');
  });

  it("should handle image with children", async () => {
    const imageData = [0x42, 0x4d]; // BMP magic bytes
    const files = {
      "test.bmp": createFileFromBytes(
        new Uint8Array(imageData),
        "test.bmp",
        "image/bmp",
      ),
    };

    const svg = await generateSvgFromJson(
      {
        children: [
          {
            image_path: "test.bmp",
            children: [
              { tag: "title", children: ["Image Title"] },
              { tag: "desc", children: ["Image Description"] },
            ],
          },
        ],
      },
      files,
    );

    expect(svg).toContain("<image");
    expect(svg).toContain('href="data:image/bmp;base64,');
    expect(svg).toContain("<title>Image Title</title>");
    expect(svg).toContain("<desc>Image Description</desc>");
    expect(svg).toContain("</image>");
  });

  it("should infer image type from extension", async () => {
    const testCases = [
      { file: "test.jpg", expectedType: "jpeg" },
      { file: "test.jpeg", expectedType: "jpeg" },
      { file: "test.png", expectedType: "png" },
      { file: "test.gif", expectedType: "gif" },
      { file: "test.webp", expectedType: "webp" },
      { file: "test.svg", expectedType: "svg+xml" },
    ];

    for (const { file, expectedType } of testCases) {
      const files = {
        [file]: createFileFromBytes(new Uint8Array([0x00, 0x01, 0x02]), file),
      };

      const svg = await generateSvgFromJson(
        { children: [{ image_path: file }] },
        files,
      );

      expect(svg).toContain(`data:image/${expectedType};base64,`);
    }
  });

  it("should use explicit kind when provided", async () => {
    const files = {
      "test.img": createFileFromBytes(new Uint8Array([0x00, 0x01]), "test.img"),
    };

    const svg = await generateSvgFromJson(
      { children: [{ image_path: "test.img", kind: "jpeg" }] },
      files,
    );

    expect(svg).toContain("data:image/jpeg;base64,");
  });

  it("should handle missing image file", async () => {
    await expect(
      generateSvgFromJson({ children: [{ image_path: "missing.jpg" }] }),
    ).rejects.toThrow();
  });

  it("should handle nested image paths", async () => {
    const files = {
      "images/deep/nested.png": createFileFromBytes(
        new Uint8Array([0x89, 0x50]),
        "nested.png",
      ),
    };

    const svg = await generateSvgFromJson(
      { children: [{ image_path: "images/deep/nested.png" }] },
      files,
    );

    expect(svg).toContain("data:image/png;base64,");
  });
});

// =============================================================================
// Font Tag Tests
// =============================================================================

describe("Font Tag Generation", () => {
  it("should generate bundled font", async () => {
    const svg = await generateSvgFromJson({
      children: [{ fonts: [{ name: "Impact", bundled: true }] }],
    });

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<style>");
    expect(svg).toContain("@font-face{");
    expect(svg).toContain("font-family:Impact;");
    expect(svg).toContain(
      // lots more after this too
      "src:url('data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAOSkABIAAAA",
    );
    expect(svg).toContain("</style>");
    expect(svg).toContain("</defs>");
  });

  it("should generate user-provided font", async () => {
    const fontData = [0x77, 0x4f, 0x46, 0x32]; // WOFF2 magic bytes
    const files = {
      "fonts/custom.woff2": createFileFromBytes(
        new Uint8Array(fontData),
        "custom.woff2",
        "font/woff2",
      ),
    };

    const svg = await generateSvgFromJson(
      {
        children: [
          { fonts: [{ name: "CustomFont", path: "fonts/custom.woff2" }] },
        ],
      },
      files,
    );

    expect(svg).toContain("@font-face{");
    expect(svg).toContain("font-family:CustomFont;");
    expect(svg).toContain("src:url('data:font/woff2;charset=utf-8;base64,");
    expect(svg).toContain("') format('woff2');");
  });

  it("should generate multiple fonts", async () => {
    const fontData = [0x4f, 0x54, 0x54, 0x4f]; // OpenType magic
    const files = {
      "font1.ttf": createFileFromBytes(
        new Uint8Array(fontData),
        "font1.ttf",
        "font/ttf",
      ),
      "font2.woff": createFileFromBytes(
        new Uint8Array(fontData),
        "font2.woff",
        "font/woff",
      ),
    };

    const svg = await generateSvgFromJson(
      {
        children: [
          {
            fonts: [
              { name: "Font1", path: "font1.ttf" },
              { name: "Impact", bundled: true },
              { name: "Font2", path: "font2.woff" },
            ],
          },
        ],
      },
      files,
    );

    expect(svg).toContain("font-family:Font1;");
    expect(svg).toContain("font-family:Impact;");
    expect(svg).toContain("font-family:Font2;");
  });

  it("should include font attributes", async () => {
    const svg = await generateSvgFromJson(
      {
        children: [
          {
            fonts: [
              {
                name: "CustomFont",
                bundled: false,
                path: "path/to/custom/font.woff2",
                attrs: {
                  "font-weight": "bold",
                  "font-style": "italic",
                  "font-display": "swap",
                },
              },
            ],
          },
        ],
      },
      {
        "path/to/custom/font.woff2": createFileFromBytes(
          new Uint8Array(Array.from(TEST_FONT_WOFF2)),
          "font.woff2",
        ),
      },
    );

    expect(svg).toContain("font-weight:bold;");
    expect(svg).toContain("font-style:italic;");
    expect(svg).toContain("font-display:swap;");
  });

  it("should include defs attributes", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          fonts: [{ name: "Impact", bundled: true }],
          attrs: { id: "font-definitions" },
        },
      ],
    });

    expect(svg).toContain('<defs id="font-definitions">');
  });

  it("should handle missing user font file", async () => {
    await expect(
      generateSvgFromJson({
        children: [{ fonts: [{ name: "MissingFont", path: "missing.woff2" }] }],
      }),
    ).rejects.toThrow();
  });

  it("should handle unknown bundled font", async () => {
    await expect(
      generateSvgFromJson({
        children: [{ fonts: [{ name: "UnknownFont", bundled: true }] }],
      }),
    ).rejects.toThrow();
  });
});

// =============================================================================
// Nested SVG Tag Tests
// =============================================================================

describe("Nested SVG Tag Generation", () => {
  it("should embed nested SVG file", async () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
			<circle cx="5" cy="5" r="3" fill="red"/>
		</svg>`;

    const files = {
      "icon.svg": svgContent,
    };

    const svg = await generateSvgFromJson(
      { children: [{ svg_path: "icon.svg" }] },
      files,
    );

    expect(svg).toContain("<g>");
    expect(svg).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
    );
    expect(svg).toContain('<circle cx="5" cy="5" r="3" fill="red"/>');
    expect(svg).toContain("</svg>");
    expect(svg).toContain("</g>");
  });

  it("should remove XML declaration from nested SVG", async () => {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
		<svg xmlns="http://www.w3.org/2000/svg">
			<rect x="0" y="0" width="10" height="10"/>
		</svg>`;

    const files = {
      "graphic.svg": svgContent,
    };

    const svg = await generateSvgFromJson(
      { children: [{ svg_path: "graphic.svg" }] },
      files,
    );

    expect(svg).not.toContain("<?xml");
    expect(svg).toContain("<svg xmlns=");
    expect(svg).toContain("<rect");
  });

  it("should wrap nested SVG with attributes", async () => {
    const svgContent = `<svg><circle r="5"/></svg>`;
    const files = { "circle.svg": svgContent };

    const svg = await generateSvgFromJson(
      {
        children: [
          {
            svg_path: "circle.svg",
            attrs: {
              transform: "translate(50,50) scale(2)",
              opacity: "0.8",
            },
          },
        ],
      },
      files,
    );

    expect(svg).toContain(
      '<g transform="translate(50,50) scale(2)" opacity="0.8">',
    );
    expect(svg).toContain('<svg><circle r="5"/></svg>');
    expect(svg).toContain("</g>");
  });

  it("should handle missing SVG file", async () => {
    await expect(
      generateSvgFromJson({ children: [{ svg_path: "missing.svg" }] }),
    ).rejects.toThrow();
  });

  it("should handle nested SVG paths", async () => {
    const files = {
      "graphics/icons/star.svg": "<svg><path d='M0,0 L5,5'/></svg>",
    };

    const svg = await generateSvgFromJson(
      { children: [{ svg_path: "graphics/icons/star.svg" }] },
      files,
    );

    expect(svg).toContain("<path d='M0,0 L5,5'/>");
  });
});

// =============================================================================
// Complex Integration Tests
// =============================================================================

describe("Complex SVG Generation", () => {
  it("should generate complex mixed content", async () => {
    const files = {
      "logo.png": createFileFromBytes(
        new Uint8Array([0x89, 0x50]),
        "logo.png",
        "image/png",
      ),
      "icon.svg": "<svg><circle r='3'/></svg>",
      "font.woff2": createFileFromBytes(
        new Uint8Array([0x77, 0x4f]),
        "font.woff2",
        "font/woff2",
      ),
    };

    const svg = await generateSvgFromJson(
      {
        attrs: { viewBox: "0 0 400 300", width: 400, height: 300 },
        children: [
          {
            fonts: [{ name: "CustomFont", path: "font.woff2" }],
            attrs: { id: "fonts" },
          },
          {
            tag: "g",
            attrs: { transform: "translate(20,20)" },
            children: [
              {
                image_path: "logo.png",
                attrs: { width: 100, height: 50 },
              },
              "Company Logo",
              {
                tag: "text",
                attrs: { x: 0, y: 70, "font-family": "CustomFont" },
                children: [
                  "Welcome to our ",
                  {
                    text: "<strong>amazing</strong>",
                    is_preescaped: true,
                  },
                  " website!",
                ],
              },
              {
                svg_path: "icon.svg",
                attrs: { transform: "translate(150,10)" },
              },
            ],
          },
        ],
      },
      files,
    );

    // Verify structure
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain('<defs id="fonts">');
    expect(svg).toContain("font-family:CustomFont;");
    expect(svg).toContain('<g transform="translate(20,20)">');
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain("Company Logo");
    expect(svg).toContain("<strong>amazing</strong>");
    expect(svg).toContain('<g transform="translate(150,10)">');
    expect(svg).toContain("<circle r='3'/>");
  });

  it("should preserve attribute order and formatting", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "rect",
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            fill: "blue",
            stroke: "red",
            "stroke-width": 2,
          },
        },
      ],
    });

    // All attributes should be present (order may vary)
    expect(svg).toContain('x="0"');
    expect(svg).toContain('y="0"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('fill="blue"');
    expect(svg).toContain('stroke="red"');
    expect(svg).toContain('stroke-width="2"');
  });

  it("should handle deeply nested structures", async () => {
    const svg = await generateSvgFromJson({
      children: [
        {
          tag: "g",
          children: [
            {
              tag: "g",
              children: [
                {
                  tag: "g",
                  children: [
                    {
                      tag: "rect",
                      attrs: { x: 0, y: 0, width: 10, height: 10 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(svg).toContain("<g><g><g>");
    expect(svg).toContain('<rect x="0" y="0" width="10" height="10"/>');
    expect(svg).toContain("</g></g></g>");
  });

  it("should handle empty and whitespace content gracefully", async () => {
    const svg = await generateSvgFromJson({
      children: [
        "",
        { text: "" },
        { text: "   " },
        { tag: "g", children: [] },
        { tag: "rect" },
        "    \n\t    ",
      ],
    });

    // Should generate valid SVG with content preserved
    expect(svg).toContain("<g></g>");
    expect(svg).toContain("<rect/>");
    expect(svg).toContain("   "); // Whitespace preserved
    expect(svg).toContain("    \n\t    ");
  });
});
