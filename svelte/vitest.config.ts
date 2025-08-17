import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		include: ["src/lib/collagen-ts/**/*.{test,spec}.{js,ts}"],
		exclude: ["node_modules/**", "src/lib/collagen-ts/**/*.d.ts"],
		pool: "threads",
		poolOptions: { threads: { maxThreads: 2, useAtomics: true } },
		browser: { api: { port: 63315 } },
	},
	resolve: { alias: { "@": "/src", "@collagen": "/src/lib/collagen-ts" } },
});
