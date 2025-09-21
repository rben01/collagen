import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	plugins: [sveltekit()],
	build: { minify: "esbuild", chunkSizeWarningLimit: 1000 },
	resolve: {
		alias: {
			"@tabler-icons": fileURLToPath(
				new URL("./node_modules/@tabler/icons/icons", import.meta.url),
			),
		},
	},
	optimizeDeps: { exclude: ["svelte-codemirror-editor", "codemirror"] },
});
