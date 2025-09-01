import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig({
	plugins: [svelte()],
	test: {
		expect: { requireAssertions: true },
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
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			$lib: path.resolve(__dirname, "./src/lib"),
		},
	},
});
