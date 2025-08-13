<script>
	import { onMount } from "svelte";
	import FileUploader from "./FileUploader.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";

	let wasm;
	let sjsonnet;
	let error = null;
	let loading = false;
	let svgOutput = null;
	let filesData = null;

	onMount(async () => {
		try {
			// Load both WASM and sjsonnet modules in parallel
			const [wasmModule, sjsonnetModule] = await Promise.all([
				import("../Cargo.toml"),
				loadSjsonnet(),
			]);

			wasm = wasmModule;
			sjsonnet = sjsonnetModule;
			console.log("WASM module loaded successfully");
			console.log("sjsonnet module loaded successfully");
		} catch (err) {
			console.error("Failed to load modules:", err);
			error = "Failed to load modules: " + err.message;
		}
	});

	async function loadSjsonnet() {
		// Check if SjsonnetMain is already available
		if (typeof window !== "undefined" && typeof window.SjsonnetMain !== "undefined") {
			return window.SjsonnetMain;
		}

		// Load sjsonnet.js as a script tag since it's not a module
		return new Promise((resolve, reject) => {
			// Check if the script is already loading or loaded
			const existingScript = document.querySelector('script[src="/sjsonnet.js"]');
			if (existingScript) {
				// Script is already in DOM, wait for it or use existing SjsonnetMain
				if (typeof window.SjsonnetMain !== "undefined") {
					resolve(window.SjsonnetMain);
					return;
				}
				// Wait for existing script to load
				existingScript.addEventListener("load", () => {
					if (typeof window.SjsonnetMain !== "undefined") {
						resolve(window.SjsonnetMain);
					} else {
						reject(new Error("SjsonnetMain not found after script load"));
					}
				});
				return;
			}

			// Set up exports object before loading sjsonnet.js
			if (typeof window.exports === "undefined") {
				window.exports = {};
			}

			const script = document.createElement("script");
			script.src = "/sjsonnet.js";
			script.onload = () => {
				// Add a small delay to ensure the script has fully executed
				setTimeout(() => {
					console.log("sjsonnet.js loaded, checking for SjsonnetMain...");

					// Check multiple possible locations for SjsonnetMain
					let sjsonnetMain = null;

					if (typeof window.SjsonnetMain !== "undefined") {
						sjsonnetMain = window.SjsonnetMain;
						console.log("Found SjsonnetMain on window:", typeof sjsonnetMain);
					} else if (
						typeof window.exports !== "undefined" &&
						window.exports.SjsonnetMain
					) {
						sjsonnetMain = window.exports.SjsonnetMain;
						console.log("Found SjsonnetMain on window.exports:", typeof sjsonnetMain);
					} else if (typeof exports !== "undefined" && exports.SjsonnetMain) {
						sjsonnetMain = exports.SjsonnetMain;
						console.log("Found SjsonnetMain on exports:", typeof sjsonnetMain);
					} else {
						// Check for global variables that might be SjsonnetMain
						const globals = Object.keys(window).filter(
							k => k.includes("jsonnet") || k.includes("Sjsonnet"),
						);
						console.log("Available globals with jsonnet:", globals);

						// Also check for any variable that might be the main Sjsonnet object
						for (const key of Object.keys(window)) {
							const value = window[key];
							if (
								value &&
								typeof value === "object" &&
								typeof value.interpret === "function"
							) {
								sjsonnetMain = value;
								console.log("Found potential SjsonnetMain via interpret method:", key);
								break;
							}
						}
					}

					if (sjsonnetMain) {
						resolve(sjsonnetMain);
					} else {
						reject(new Error("SjsonnetMain not found after script load"));
					}
				}, 100);
			};
			script.onerror = () => reject(new Error("Failed to load sjsonnet.js"));
			document.head.appendChild(script);
		});
	}

	async function processManifest(fileMap, folderName) {
		// Check for jsonnet manifest first (with leading slash)
		const jsonnetPath = "/collagen.jsonnet";
		const jsonPath = "/collagen.json";

		if (fileMap.has(jsonnetPath)) {
			console.log("Found jsonnet manifest, compiling to JSON...");

			try {
				// Read the jsonnet file
				const jsonnetFile = fileMap.get(jsonnetPath);
				const jsonnetContent = await jsonnetFile.text();

				// Compile jsonnet to JSON using sjsonnet
				const importCallback = (workingDir, importedPath) => {
					// Handle imports by looking up files in our fileMap
					let resolvedPath = importedPath.startsWith("./")
						? importedPath.substring(2)
						: importedPath;

					// Ensure resolved path has leading slash
					if (!resolvedPath.startsWith("/")) {
						resolvedPath = "/" + resolvedPath;
					}

					if (fileMap.has(resolvedPath)) {
						return fileMap.get(resolvedPath).text();
					}

					// If not found, return null (will cause import error)
					return null;
				};

				// TODO: it's wasteful to serialize to JSON just to get the data over to
				// Rust just to deserialize again. Can we pass a JS object straight to Rust?
				const compiledJson = JSON.stringify(
					sjsonnet.interpret(
						jsonnetContent,
						{}, // ext vars
						{}, // tla vars
						jsonnetPath,
						importCallback,
					),
				);

				// Create a new JSON file and add it to the fileMap
				const jsonBlob = new Blob([compiledJson], { type: "application/json" });
				const jsonFile = new File([jsonBlob], "collagen.json", {
					type: "application/json",
				});
				fileMap.set(jsonPath, jsonFile);
				fileMap.delete(jsonnetPath);

				console.log("Successfully compiled jsonnet to JSON");
				return "json"; // We now have a JSON manifest
			} catch (err) {
				console.error("Failed to compile jsonnet:", err);
				throw new Error(`Jsonnet compilation failed: ${err.message}`);
			}
		} else if (fileMap.has(jsonPath)) {
			console.log("Found JSON manifest");
			return "json";
		} else {
			return "none";
		}
	}

	async function handleFilesUploaded(event) {
		const { files, folderName } = event.detail;
		filesData = files;
		svgOutput = null;
		error = null;

		if (!wasm || !sjsonnet) {
			error = "Modules not loaded yet";
			return;
		}

		try {
			loading = true;

			// Convert FileList to Map for WASM
			const fileMap = new Map();
			for (const [path, file] of Object.entries(files)) {
				// Ensure all paths have a leading slash (treat user folder as root)
				const normalizedPath = path.startsWith("/") ? path : "/" + path;
				fileMap.set(normalizedPath, file);
			}

			// Create in-memory filesystem
			const fsHandle = await wasm.createInMemoryFs(fileMap);
			console.log(
				`Created in-memory filesystem with ${fsHandle.getFileCount()} files` +
					(folderName ? ` from folder "${folderName}"` : ""),
			);

			// Check for manifest and handle jsonnet compilation
			const manifestType = await processManifest(fileMap);
			if (manifestType === "none") {
				error =
					"No manifest file found. Please include collagen.json or collagen.jsonnet";
				return;
			}

			console.log({ fileMap });

			// Recreate filesystem after potential jsonnet compilation
			const finalFsHandle = await wasm.createInMemoryFs(fileMap, folderName);

			// Generate SVG (always using JSON now)
			const svg = wasm.generateSvg(finalFsHandle, "json");
			svgOutput = svg;
			console.log("Generated SVG successfully");
		} catch (err) {
			console.error("Error processing files:", err);
			error = "Error processing files: " + err.message;
		} finally {
			loading = false;
		}
	}

	function handleClearFiles() {
		filesData = null;
		svgOutput = null;
		error = null;
	}
</script>

<main>
	<h1>Collagen Web</h1>
	<p>Generate SVG collages from JSON/Jsonnet manifests</p>

	{#if error}
		<div class="error">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="loading">
			<p>Processing files...</p>
		</div>
	{/if}

	<div class="upload-section">
		<FileUploader
			on:files-uploaded={handleFilesUploaded}
			on:clear={handleClearFiles}
			disabled={loading || !wasm || !sjsonnet}
		/>
	</div>

	{#if filesData}
		<div class="files-info">
			<h3>Uploaded Files ({Object.keys(filesData).length})</h3>
			<ul>
				{#each Object.keys(filesData) as path}
					<li>{path}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if svgOutput}
		<div class="svg-section">
			<SvgDisplay svg={svgOutput} />
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2em;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
			Cantarell, sans-serif;
	}

	h1 {
		color: #2563eb;
		text-align: center;
		font-size: 2.5em;
		margin-bottom: 0.5em;
	}

	p {
		text-align: center;
		color: #6b7280;
		font-size: 1.1em;
		margin-bottom: 2em;
	}

	.error {
		background: #fee2e2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 1em;
		border-radius: 0.5em;
		margin-bottom: 1em;
	}

	.loading {
		text-align: center;
		padding: 2em;
		color: #6b7280;
	}

	.upload-section {
		margin-bottom: 2em;
	}

	.files-info {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		padding: 1em;
		margin-bottom: 2em;
	}

	.files-info h3 {
		margin: 0 0 0.5em 0;
		color: #374151;
	}

	.files-info ul {
		list-style-type: none;
		padding: 0;
		margin: 0;
	}

	.files-info li {
		padding: 0.25em 0;
		color: #6b7280;
		font-family: monospace;
		font-size: 0.9em;
	}

	.svg-section {
		border-top: 1px solid #e5e7eb;
		padding-top: 2em;
	}
</style>
