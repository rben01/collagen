import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		include: ["src/lib/collagen-ts/**/*.{test,spec}.{js,ts}"],
		exclude: ["node_modules/**", "src/lib/collagen-ts/**/*.d.ts"],
		pool: "threads",
		poolOptions: { threads: { maxThreads: 2, useAtomics: true } },
		deps: {
			optimizer: {
				ssr: {
					exclude: ["src/lib/collagen-ts/jsonnet/sjsonnet.js"],
					needsInterop: ["src/lib/collagen-ts/jsonnet/sjsonnet.js"],
				},
			},
		},
	},
	resolve: { alias: { "@": "/src", "@collagen": "/src/lib/collagen-ts" } },
});
