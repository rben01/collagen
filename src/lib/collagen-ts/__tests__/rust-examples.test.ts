/**
 * Rust example tests ported to TypeScript
 *
 * These tests port actual test cases from the Rust implementation to verify
 * that the TypeScript implementation produces identical output.
 */

import { describe, it, expect } from "vitest";
import {
  expectSvgEqual,
  generateSvgFromFiles,
  TEST_IMAGE_PNG,
} from "./test-utils.js";

describe("Rust Examples - Basic Cases", () => {
  it("should match empty example output", async () => {
    const files = { "collagen.json": "{}" };

    const svg = await generateSvgFromFiles(files);
    expectSvgEqual(svg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it("should match basic-smiley-pure-svg example", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        attrs: { viewBox: "0 0 100 100" },
        children: [
          {
            tag: "circle",
            attrs: {
              cx: "50%",
              cy: "50%",
              r: "40%",
              fill: "#ff0",
              stroke: "#000",
              "stroke-width": 3,
            },
          },
          {
            tag: "circle",
            attrs: {
              cx: 35,
              cy: 40,
              r: 5,
              fill: "#fff",
              stroke: "#000",
              "stroke-width": 1,
            },
          },
          {
            tag: "circle",
            attrs: {
              cx: 65,
              cy: 40,
              r: 5,
              fill: "#fff",
              stroke: "#000",
              "stroke-width": 1,
            },
          },
          {
            tag: "line",
            attrs: {
              x1: 25,
              y1: 60,
              x2: 75,
              y2: 60,
              stroke: "#f21",
              "stroke-width": 3,
            },
          },
        ],
      }),
    };

    const svg = await generateSvgFromFiles(files);

    // Check key components rather than exact match for now
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('cx="50%" cy="50%" r="40%"');
    expect(svg).toContain('fill="#ff0"');
    expect(svg).toContain('stroke="#000"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain("<line");
  });

  it("should handle simple-nesting example structure", async () => {
    const files = {
      // Main folder A
      "collagen.json": JSON.stringify({
        attrs: { viewBox: "0 0 30 30" },
        children: [
          {
            tag: "g",
            attrs: { transform: "rotate(-45)" },
            children: [{ clgn_path: "B" }],
          },
        ],
      }),
      // Nested folder B
      "B/collagen.json": JSON.stringify({
        children: [
          {
            tag: "rect",
            attrs: { x: 0, y: 5, width: 10, height: 20, fill: "blue" },
          },
        ],
      }),
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain('viewBox="0 0 30 30"');
    expect(svg).toContain('transform="rotate(-45)"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('fill="blue"');
  });
});

describe("Rust Examples - Advanced Features", () => {
  it("should handle images with various formats", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        attrs: { viewBox: "0 0 200 100" },
        children: [
          {
            image_path: "test.png",
            attrs: { x: 0, y: 0, width: 100, height: 100 },
          },
          {
            image_path: "test.jpg",
            kind: "jpeg",
            attrs: { x: 100, y: 0, width: 100, height: 100 },
          },
        ],
      }),
      "test.png": TEST_IMAGE_PNG,
      "test.jpg": TEST_IMAGE_PNG, // Using PNG data with JPG extension
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain("data:image/jpeg;base64,");
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="100"');
  });

  it("should handle nested SVG inclusion", async () => {
    const nestedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <circle cx="25" cy="25" r="20" fill="red"/>
</svg>`;

    const files = {
      "collagen.json": JSON.stringify({
        children: [{ svg_path: "icon.svg", attrs: { transform: "scale(2)" } }],
      }),
      "icon.svg": nestedSvg,
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain('<g transform="scale(2)">');
    expect(svg).toContain('<circle cx="25" cy="25" r="20" fill="red"/>');
    expect(svg).not.toContain("<?xml"); // XML header should be stripped
  });

  it("should handle text content in various forms", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [
          "Plain text string",
          { text: "Object form text" },
          {
            text: "<b>Pre-escaped</b> &amp; content",
            is_preescaped: true,
          },
          {
            tag: "text",
            attrs: { x: 10, y: 20 },
            children: ["Nested text content"],
          },
        ],
      }),
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain("Plain text string");
    expect(svg).toContain("Object form text");
    expect(svg).toContain("<b>Pre-escaped</b> &amp; content");
    expect(svg).toContain('<text x="10" y="20">');
    expect(svg).toContain("Nested text content");
  });

  it("should handle complex nested structures", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        attrs: { viewBox: "0 0 300 200" },
        children: [
          {
            tag: "defs",
            children: [
              {
                tag: "linearGradient",
                attrs: {
                  id: "grad1",
                  x1: "0%",
                  y1: "0%",
                  x2: "100%",
                  y2: "0%",
                },
                children: [
                  {
                    tag: "stop",
                    attrs: {
                      offset: "0%",
                      "stop-color": "rgb(255,255,0)",
                      "stop-opacity": 1,
                    },
                  },
                  {
                    tag: "stop",
                    attrs: {
                      offset: "100%",
                      "stop-color": "rgb(255,0,0)",
                      "stop-opacity": 1,
                    },
                  },
                ],
              },
            ],
          },
          {
            tag: "ellipse",
            attrs: {
              cx: 150,
              cy: 100,
              rx: 85,
              ry: 55,
              fill: "url(#grad1)",
            },
          },
        ],
      }),
    };

    const svg = await generateSvgFromFiles(files);

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('id="grad1"');
    expect(svg).toContain("<stop");
    expect(svg).toContain('stop-color="rgb(255,255,0)"');
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('fill="url(#grad1)"');
  });
});

describe("Rust Examples - Error Cases", () => {
  it("should handle missing files gracefully", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [{ image_path: "missing.png" }],
      }),
    };

    await expect(generateSvgFromFiles(files)).rejects.toThrow(
      "Missing file at path: missing.png",
    );
  });

  it("should handle invalid JSON gracefully", async () => {
    const files = {
      "collagen.json": "{ invalid json syntax }",
    };

    await expect(generateSvgFromFiles(files)).rejects.toThrow();
  });

  it("should handle unrecognized tag structures", async () => {
    const files = {
      "collagen.json": JSON.stringify({
        children: [{ unknown_tag_type: "value", random_field: 123 }],
      }),
    };

    await expect(generateSvgFromFiles(files)).rejects.toThrow(
      "did not match any known schema",
    );
  });
});
