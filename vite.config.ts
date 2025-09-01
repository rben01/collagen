import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: { exclude: ["src/lib/collagen-ts/jsonnet/sjsonnet.js"] },
	build: { minify: "esbuild" },
});
