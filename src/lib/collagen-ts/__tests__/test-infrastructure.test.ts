/**
 * Test infrastructure and data generators for comprehensive testing
 *
 * Provides utilities, generators, and infrastructure components
 * for creating test data, managing test environments, and ensuring
 * test reliability across the entire test suite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createFileFromBytes,
  generateSvgFromFiles as generateSvgFromObjectFs,
} from "./test-utils";

// =============================================================================
// Test Data Generators
// =============================================================================

/** Generate random manifest content for property-based testing */
export class ManifestGenerator {
  private static readonly SVG_TAGS = [
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "path",
    "text",
    "g",
    "defs",
    "style",
    "title",
    "desc",
  ];

  private static readonly COLORS = [
    "red",
    "blue",
    "green",
    "yellow",
    "purple",
    "orange",
    "pink",
    "cyan",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "rgb(255,0,0)",
    "hsl(120,100%,50%)",
    "rgba(0,0,255,0.5)",
  ];

  private static readonly FONTS = [
    "Arial",
    "Helvetica",
    "Times",
    "Courier",
    "Verdana",
    "Georgia",
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
  ];

  static generateRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static generateRandomColor(): string {
    return this.COLORS[Math.floor(Math.random() * this.COLORS.length)];
  }

  static generateRandomTag(): string {
    return this.SVG_TAGS[Math.floor(Math.random() * this.SVG_TAGS.length)];
  }

  static generateRandomFont(): string {
    return this.FONTS[Math.floor(Math.random() * this.FONTS.length)];
  }

  static generateRandomText(minLength = 5, maxLength = 50): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ";
    const length = this.generateRandomNumber(minLength, maxLength);
    return [...Array(length)]
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join("");
  }

  static generateRandomAttributes(tag: string): Record<string, any> {
    const common = {
      id: `${tag}-${this.generateRandomNumber(1000, 9999)}`,
      class: `class-${this.generateRandomNumber(1, 10)}`,
      opacity: Math.random(),
    };

    switch (tag) {
      case "rect":
        return {
          ...common,
          x: this.generateRandomNumber(0, 100),
          y: this.generateRandomNumber(0, 100),
          width: this.generateRandomNumber(10, 200),
          height: this.generateRandomNumber(10, 200),
          fill: this.generateRandomColor(),
          stroke: this.generateRandomColor(),
          "stroke-width": this.generateRandomNumber(1, 5),
          rx: this.generateRandomNumber(0, 10),
          ry: this.generateRandomNumber(0, 10),
        };

      case "circle":
        return {
          ...common,
          cx: this.generateRandomNumber(0, 100),
          cy: this.generateRandomNumber(0, 100),
          r: this.generateRandomNumber(5, 50),
          fill: this.generateRandomColor(),
          stroke: this.generateRandomColor(),
        };

      case "text":
        return {
          ...common,
          x: this.generateRandomNumber(0, 200),
          y: this.generateRandomNumber(20, 200),
          "font-family": this.generateRandomFont(),
          "font-size": this.generateRandomNumber(8, 24),
          fill: this.generateRandomColor(),
          "text-anchor": ["start", "middle", "end"][
            this.generateRandomNumber(0, 2)
          ],
        };

      case "line":
        return {
          ...common,
          x1: this.generateRandomNumber(0, 100),
          y1: this.generateRandomNumber(0, 100),
          x2: this.generateRandomNumber(0, 100),
          y2: this.generateRandomNumber(0, 100),
          stroke: this.generateRandomColor(),
          "stroke-width": this.generateRandomNumber(1, 5),
        };

      case "g":
        return {
          ...common,
          transform: `translate(${this.generateRandomNumber(0, 50)}, ${this.generateRandomNumber(0, 50)})`,
        };

      default:
        return common;
    }
  }

  static generateRandomElement(maxDepth = 3, currentDepth = 0): any {
    const tag = this.generateRandomTag();
    const element: any = { tag, attrs: this.generateRandomAttributes(tag) };

    // Add children for container elements
    if (["g", "defs"].includes(tag) && currentDepth < maxDepth) {
      const childCount = this.generateRandomNumber(1, 4);
      element.children = [...Array(childCount)].map(() =>
        this.generateRandomElement(maxDepth, currentDepth + 1),
      );
    }

    // Add text content for text elements
    if (tag === "text") {
      element.children = [this.generateRandomText()];
    }

    return element;
  }

  static generateRandomManifest(elementCount = 10, complexity = "medium"): any {
    const maxDepth =
      complexity === "simple" ? 1 : complexity === "medium" ? 3 : 5;

    const children = [...Array(elementCount)].map(() =>
      this.generateRandomElement(maxDepth),
    );

    return {
      attrs: {
        viewBox: `0 0 ${this.generateRandomNumber(200, 1000)} ${this.generateRandomNumber(200, 1000)}`,
        width: this.generateRandomNumber(200, 800),
        height: this.generateRandomNumber(200, 600),
      },
      children,
    };
  }
}

/** Generate test files for various scenarios */
export class TestFileGenerator {
  static generateImageFile(
    format: "png" | "jpg" | "gif" | "webp",
    size = 100,
  ): File {
    const headers = {
      png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      jpg: [0xff, 0xd8, 0xff, 0xe0],
      gif: [0x47, 0x49, 0x46, 0x38],
      webp: [0x52, 0x49, 0x46, 0x46],
    };

    const header = headers[format];
    const data = [
      ...header,
      ...[...Array(size - header.length)].map(() =>
        Math.floor(Math.random() * 256),
      ),
    ];

    return createFileFromBytes(
      new Uint8Array(data),
      `test.${format}`,
      `image/${format}`,
    );
  }

  static generateFontFile(
    format: "woff" | "woff2" | "ttf" | "otf",
    size = 200,
  ): File {
    const headers = {
      woff: [0x77, 0x4f, 0x46, 0x46],
      woff2: [0x77, 0x4f, 0x46, 0x32],
      ttf: [0x00, 0x01, 0x00, 0x00],
      otf: [0x4f, 0x54, 0x54, 0x4f],
    };

    const header = headers[format];
    const data = [
      ...header,
      ...[
        ...Array(size - header.length).map(() =>
          Math.floor(Math.random() * 256),
        ),
      ],
    ];

    return createFileFromBytes(
      new Uint8Array(data),
      `font.${format}`,
      `font/${format}`,
    );
  }

  static generateSvgFile(
    complexity: "simple" | "medium" | "complex" = "medium",
  ): string {
    const templates = {
      simple:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>',
      medium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
				<defs>
					<linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
						<stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
					</linearGradient>
				</defs>
				<rect x="10" y="10" width="180" height="180" fill="url(#grad1)"/>
				<circle cx="100" cy="100" r="50" fill="rgba(0,0,255,0.5)"/>
			</svg>`,
      complex: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
				<defs>
					<pattern id="pattern1" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
						<rect x="0" y="0" width="10" height="10" fill="red"/>
						<rect x="10" y="10" width="10" height="10" fill="blue"/>
					</pattern>
				</defs>
				<g transform="translate(50,50)">
					<rect x="0" y="0" width="300" height="200" fill="url(#pattern1)"/>
					<g opacity="0.8">
						<circle cx="150" cy="100" r="80" fill="green"/>
						<text x="150" y="105" text-anchor="middle" font-size="16">Complex SVG</text>
					</g>
				</g>
			</svg>`,
    };

    return templates[complexity];
  }

  static generateProjectFiles(
    type: "minimal" | "standard" | "complex" | "invalid",
  ): Record<string, string | File> {
    switch (type) {
      case "minimal":
        return {
          "collagen.json": "{}",
        };

      case "standard":
        const manifest = ManifestGenerator.generateRandomManifest(5, "medium");
        return {
          "collagen.json": JSON.stringify(manifest),
          "image.png": this.generateImageFile("png"),
          "icon.svg": this.generateSvgFile("simple"),
        };

      case "complex":
        const complexManifest = {
          attrs: { viewBox: "0 0 800 600" },
          children: [
            { image_path: "background.jpg" },
            { svg_path: "logo.svg" },
            {
              fonts: [
                { name: "CustomFont", path: "fonts/custom.woff2" },
                { name: "Impact", bundled: true },
              ],
            },
            ...ManifestGenerator.generateRandomManifest(15, "complex").children,
          ],
        };
        return {
          "collagen.json": JSON.stringify(complexManifest),
          "background.jpg": this.generateImageFile("jpg", 2000),
          "logo.svg": this.generateSvgFile("complex"),
          "fonts/custom.woff2": this.generateFontFile("woff2"),
          "image1.png": this.generateImageFile("png"),
          "image2.webp": this.generateImageFile("webp"),
          "icons/arrow.svg": this.generateSvgFile("medium"),
        };

      case "invalid":
        return {
          "collagen.json": "{ invalid json content",
          "missing-ref.json": JSON.stringify({
            children: [{ image_path: "nonexistent.png" }],
          }),
        };

      default:
        throw new Error(`Unknown project type: ${type}`);
    }
  }
}

// =============================================================================
// Test Environment Management
// =============================================================================

/** Manage test environment and cleanup */
export class TestEnvironment {
  private static mockConsole: { [K in keyof Console]?: any } = {};
  private static originalConsole: { [K in keyof Console]?: any } = {};

  static setupMocks() {
    // Mock console methods to reduce noise in tests
    this.originalConsole.log = console.log;
    this.originalConsole.warn = console.warn;
    this.originalConsole.error = console.error;

    this.mockConsole.log = vi.fn();
    this.mockConsole.warn = vi.fn();
    this.mockConsole.error = vi.fn();

    console.log = this.mockConsole.log;
    console.warn = this.mockConsole.warn;
    console.error = this.mockConsole.error;
  }

  static restoreMocks() {
    console.log = this.originalConsole.log || console.log;
    console.warn = this.originalConsole.warn || console.warn;
    console.error = this.originalConsole.error || console.error;
  }

  static getConsoleCalls() {
    return {
      log: this.mockConsole.log.mock?.calls || [],
      warn: this.mockConsole.warn.mock?.calls || [],
      error: this.mockConsole.error.mock?.calls || [],
    };
  }

  static mockPerformance() {
    if (typeof performance === "undefined") {
      (global as any).performance = {
        now: () => Date.now(),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByName: vi.fn(() => []),
        memory: { usedJSHeapSize: 1000000, totalJSHeapSize: 2000000 },
      };
    }
  }

  static mockFileAPI() {
    if (typeof File === "undefined") {
      (global as any).File = class MockFile {
        name: string;
        size: number;
        type: string;

        constructor(bits: any[], filename: string, options: any = {}) {
          this.name = filename;
          this.type = options.type || "text/plain";
          this.size = bits.reduce(
            (acc, bit) => acc + (bit.length || bit.size || 1),
            0,
          );
        }

        text() {
          return Promise.resolve("mock file content");
        }

        arrayBuffer() {
          return Promise.resolve(new ArrayBuffer(this.size));
        }
      };
    }

    if (typeof Blob === "undefined") {
      (global as any).Blob = class MockBlob {
        size: number;
        type: string;

        constructor(bits: any[], options: any = {}) {
          this.type = options.type || "text/plain";
          this.size = bits.reduce((acc, bit) => acc + (bit.length || 1), 0);
        }
      };
    }
  }

  static setup() {
    this.setupMocks();
    this.mockPerformance();
    this.mockFileAPI();
  }

  static cleanup() {
    this.restoreMocks();
    vi.clearAllMocks();
  }
}

// =============================================================================
// Property-Based Testing Utilities
// =============================================================================

/** Property-based testing helpers */
export class PropertyTesting {
  static async testProperty<T>(
    generator: () => T,
    property: (input: T) => Promise<boolean> | boolean,
    iterations = 100,
  ): Promise<void> {
    const failures: Array<{ input: T; error: any }> = [];

    for (let i = 0; i < iterations; i++) {
      const input = generator();

      try {
        const result = await property(input);
        if (!result) {
          failures.push({ input, error: "Property returned false" });
        }
      } catch (error) {
        failures.push({ input, error });
      }
    }

    if (failures.length > 0) {
      const exampleFailure = failures[0];
      throw new Error(
        `Property failed ${failures.length}/${iterations} times. ` +
          `Example failure: ${JSON.stringify(exampleFailure.input)} -> ${exampleFailure.error}`,
      );
    }
  }

  static generateValidManifest() {
    return ManifestGenerator.generateRandomManifest(
      ManifestGenerator.generateRandomNumber(1, 20),
      ["simple", "medium", "complex"][
        ManifestGenerator.generateRandomNumber(0, 2)
      ] as any,
    );
  }

  static generateValidFiles() {
    const projectTypes = ["minimal", "standard", "complex"] as const;
    const type =
      projectTypes[
        ManifestGenerator.generateRandomNumber(0, projectTypes.length - 1)
      ];
    return TestFileGenerator.generateProjectFiles(type);
  }
}

// =============================================================================
// Test Infrastructure Tests
// =============================================================================

describe("Test Infrastructure", () => {
  beforeEach(() => {
    TestEnvironment.setup();
  });

  afterEach(() => {
    TestEnvironment.cleanup();
  });

  describe("ManifestGenerator", () => {
    it("should generate valid random manifests", () => {
      for (let i = 0; i < 10; i++) {
        const manifest = ManifestGenerator.generateRandomManifest();

        expect(manifest).toBeDefined();
        expect(manifest.attrs).toBeDefined();
        expect(manifest.children).toBeInstanceOf(Array);
        expect(manifest.children.length).toBeGreaterThan(0);

        // All children should have valid structure
        manifest.children.forEach((child: any) => {
          if (typeof child === "object" && child.tag) {
            expect(child.tag).toBeDefined();
            expect(child.attrs).toBeDefined();
          }
        });
      }
    });

    it("should generate appropriate attributes for different tags", () => {
      const rectAttrs = ManifestGenerator.generateRandomAttributes("rect");
      expect(rectAttrs).toHaveProperty("x");
      expect(rectAttrs).toHaveProperty("y");
      expect(rectAttrs).toHaveProperty("width");
      expect(rectAttrs).toHaveProperty("height");

      const circleAttrs = ManifestGenerator.generateRandomAttributes("circle");
      expect(circleAttrs).toHaveProperty("cx");
      expect(circleAttrs).toHaveProperty("cy");
      expect(circleAttrs).toHaveProperty("r");

      const textAttrs = ManifestGenerator.generateRandomAttributes("text");
      expect(textAttrs).toHaveProperty("x");
      expect(textAttrs).toHaveProperty("y");
      expect(textAttrs).toHaveProperty("font-family");
    });
  });

  describe("TestFileGenerator", () => {
    it("should generate different project types", () => {
      const minimal = TestFileGenerator.generateProjectFiles("minimal");
      expect(Object.keys(minimal)).toHaveLength(1);
      expect(minimal).toHaveProperty("collagen.json");

      const standard = TestFileGenerator.generateProjectFiles("standard");
      expect(Object.keys(standard).length).toBeGreaterThan(1);
      expect(standard).toHaveProperty("collagen.json");

      const complex = TestFileGenerator.generateProjectFiles("complex");
      expect(Object.keys(complex).length).toBeGreaterThan(3);
      expect(complex).toHaveProperty("collagen.json");
    });

    it("should generate valid image files", () => {
      const png = TestFileGenerator.generateImageFile("png");
      expect(png.type).toBe("image/png");
      expect(png.name).toBe("test.png");

      const jpg = TestFileGenerator.generateImageFile("jpg");
      expect(jpg.type).toBe("image/jpg");
    });

    it("should generate valid font files", () => {
      const woff = TestFileGenerator.generateFontFile("woff");
      expect(woff.type).toBe("font/woff");
      expect(woff.name).toBe("font.woff");

      const woff2 = TestFileGenerator.generateFontFile("woff2");
      expect(woff2.type).toBe("font/woff2");
    });
  });

  describe("PropertyTesting", () => {
    it("should run property-based tests", async () => {
      // Test that all generated manifests can be processed
      await PropertyTesting.testProperty(
        () => PropertyTesting.generateValidManifest(),
        async (manifest) => {
          const files = {
            "collagen.json": JSON.stringify(manifest),
          };

          try {
            const svg = await generateSvgFromObjectFs(files);
            return svg.includes("<svg") && svg.includes("</svg>");
          } catch {
            return false;
          }
        },
        20, // Smaller number for faster tests
      );
    });

    it("should test SVG output properties", async () => {
      await PropertyTesting.testProperty(
        () => PropertyTesting.generateValidFiles(),
        async (files) => {
          try {
            const svg = await generateSvgFromObjectFs(files);

            // Basic SVG structure checks
            const hasOpenTag = svg.includes("<svg");
            const hasCloseTag = svg.includes("</svg>");
            const hasNamespace = svg.includes(
              'xmlns="http://www.w3.org/2000/svg"',
            );

            return hasOpenTag && hasCloseTag && hasNamespace;
          } catch {
            return false;
          }
        },
        10,
      );
    });
  });

  describe("TestEnvironment", () => {
    it("should mock console methods", () => {
      console.log("test message");
      console.warn("test warning");
      console.error("test error");

      const calls = TestEnvironment.getConsoleCalls();
      expect(calls.log).toContainEqual(["test message"]);
      expect(calls.warn).toContainEqual(["test warning"]);
      expect(calls.error).toContainEqual(["test error"]);
    });

    it("should provide performance mocking", () => {
      expect(typeof performance.now).toBe("function");
      expect(typeof performance.mark).toBe("function");
      expect(typeof performance.measure).toBe("function");
    });
  });
});

// =============================================================================
// Comprehensive Integration Test
// =============================================================================

describe("Test Infrastructure Integration", () => {
  it("should support end-to-end testing with generated data", async () => {
    const files = TestFileGenerator.generateProjectFiles("complex");

    // Should be able to process complex generated project
    const svg = await generateSvgFromObjectFs(files);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');

    // Should contain various generated elements
    const tagTypes = ["rect", "circle", "text", "g"];
    const presentTags = tagTypes.filter((tag) => svg.includes(`<${tag}`));
    expect(presentTags.length).toBeGreaterThan(0);
  });

  it("should handle stress testing with generated data", async () => {
    // Generate multiple projects and process them
    const projects = [...Array(5)].map(() =>
      TestFileGenerator.generateProjectFiles("standard"),
    );

    const results = await Promise.all(
      projects.map((files) => generateSvgFromObjectFs(files)),
    );

    // All should complete successfully
    results.forEach((svg) => {
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });
  });

  it("should verify test data consistency", () => {
    // Generate the same type multiple times - should have consistent structure
    const projects = [...Array(3)].map(() =>
      TestFileGenerator.generateProjectFiles("minimal"),
    );

    projects.forEach((project) => {
      expect(project).toHaveProperty("collagen.json");
      expect(Object.keys(project)).toHaveLength(1);
    });
  });
});
