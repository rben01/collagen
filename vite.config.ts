import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
	plugins: [sveltekit()],
	build: { minify: "esbuild", chunkSizeWarningLimit: 1000 },
});
