/**
 * Font tag tests for Collagen TypeScript implementation
 */

import { describe, it, expect } from "vitest";
import { generateSvgFromFiles, TEST_FONT_WOFF2 } from "./test-utils.js";

describe("Font Tag Tests", () => {
  it("should embed user-provided font", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [
          { fonts: [{ name: "CustomFont", path: "fonts/custom.woff2" }] },
        ],
      }),
      "fonts/custom.woff2": TEST_FONT_WOFF2,
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<style>");
    expect(svg).toContain("@font-face{");
    expect(svg).toContain("font-family:CustomFont;");
    expect(svg).toContain("data:font/woff2;charset=utf-8;base64,");
    expect(svg).toContain("</style>");
    expect(svg).toContain("</defs>");
  });

  it("should handle bundled fonts", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [{ fonts: [{ name: "Impact", bundled: true }] }],
      }),
    };

    expect(await generateSvgFromFiles(files)).toContain(
      "data:font/woff2;charset=utf-8;base64,d09GMgABAAAAAOSkABIAAAA",
    );
  });

  it("should handle font attributes", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [
          {
            fonts: [
              {
                name: "CustomFont",
                path: "custom.woff2",
                attrs: {
                  "font-weight": "bold",
                  "font-style": "italic",
                },
              },
            ],
          },
        ],
      }),
      "custom.woff2": TEST_FONT_WOFF2,
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain("font-weight:bold;");
    expect(svg).toContain("font-style:italic;");
  });
});
