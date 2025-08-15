<script>
	import { onMount } from "svelte";
	import FileUploader from "./FileUploader.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";
	import { generateSvgFromFiles, toCompatibleError } from "./lib/collagen-ts/index.js";

	let sjsonnet;
	let error = null;
	let loading = false;
	let svgOutput = null;
	let filesData = null;

	onMount(async () => {
		await loadModules();
	});

	async function loadModules() {
		try {
			// Load sjsonnet module
			const sjsonnetModule = await loadSjsonnet();
			sjsonnet = sjsonnetModule;
			console.log("Modules loaded successfully");
		} catch (err) {
			console.error("Failed to load modules:", err);
			error = "Failed to load modules: " + err.message;
		}
	}


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
		console.log("🔄 Starting file processing...");
		const { files, folderName } = event.detail;
		console.log("📁 Files received:", Object.keys(files).length, "files");

		await handleFilesWithTypeScript(files, folderName);
	}

	async function handleFilesWithTypeScript(files, folderName) {
		console.log("🔄 Processing files...");
		
		try {
			loading = true;
			filesData = files;
			svgOutput = null;
			error = null;

			// Convert FileList to Map for TypeScript implementation
			console.log("🗺️ Converting files to Map...");
			const fileMap = new Map();
			for (const [path, file] of Object.entries(files)) {
				// Ensure all paths have a leading slash (treat user folder as root)
				const normalizedPath = path.startsWith("/") ? path : "/" + path;
				fileMap.set(normalizedPath, file);
			}
			console.log("✅ File Map created with", fileMap.size, "entries");

			// Check for manifest and handle jsonnet compilation if needed
			console.log("🔍 Processing manifest...");
			const manifestType = await processManifest(fileMap, folderName);
			if (manifestType === "none") {
				error = "No manifest file found. Please include collagen.json or collagen.jsonnet";
				console.log("❌ No manifest found");
				return;
			}
			console.log("✅ Manifest processed, type:", manifestType);

			// Generate SVG using TypeScript implementation
			console.log("🎨 Generating SVG...");
			svgOutput = await generateSvgFromFiles(fileMap, "json");
			console.log("✅ SVG generated successfully! Length:", svgOutput.length);

		} catch (err) {
			console.error("Error processing files:", err);
			const compatError = toCompatibleError(err);
			error = compatError.message;
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
			disabled={loading || !sjsonnet}
		/>
	</div>

	{#if filesData}
		<div class="files-info">
			<h3>Uploaded Files ({Object.keys(filesData || {}).length})</h3>

			<!-- File size summary and warnings -->
			{#each [(() => {
					try {
						if (!filesData || typeof filesData !== "object") {
							return { totalSize: 0, warnings: [] };
						}

						const files = Object.entries(filesData);
						const totalSize = files.reduce((sum, [, file]) => {
							// Ensure file exists and has size property
							return sum + (file && typeof file.size === "number" ? file.size : 0);
						}, 0);

						const largeFiles = files.filter(([, file]) => {
							return file && typeof file.size === "number" && file.size > 5 * 1024 * 1024;
						}); // > 5MB

						const warnings = [];

						if (totalSize > 25 * 1024 * 1024) {
							// > 25MB warning
							warnings.push( { type: "warning", message: `Total size: ${(totalSize / (1024 * 1024)).toFixed(1)}MB. Large uploads may fail due to memory limits.` }, );
						}

						if (largeFiles.length > 0) {
							warnings.push( { type: "info", message: `${largeFiles.length} large file(s) detected. Consider compressing images for better performance.` }, );
						}

						return { totalSize, warnings };
					} catch (e) {
						console.error("Error calculating file summary:", e);
						return { totalSize: 0, warnings: [] };
					}
				})()] as fileSummary}
				<div class="file-summary">
					<span class="total-size">
						Total: {(fileSummary.totalSize / (1024 * 1024)).toFixed(1)}MB
					</span>

					{#each fileSummary.warnings as warning}
						<div class="file-warning {warning.type}">
							{#if warning.type === "warning"}⚠️{:else}💡{/if}
							{warning.message}
						</div>
					{/each}
				</div>
			{/each}

			<ul>
				{#each Object.entries(filesData || {}) as [path, file]}
					<li class="file-item">
						<span class="file-path">{path}</span>
						<span class="file-size">
							{#if file && typeof file.size === "number"}
								{#if file.size > 1024 * 1024}
									{(file.size / (1024 * 1024)).toFixed(1)}MB
								{:else if file.size > 1024}
									{(file.size / 1024).toFixed(0)}KB
								{:else}
									{file.size}B
								{/if}
								{#if file.size > 10 * 1024 * 1024}
									<span class="size-warning">⚠️</span>
								{/if}
							{:else}
								Unknown size
							{/if}
						</span>
					</li>
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

	.file-summary {
		margin-bottom: 1em;
		padding: 0.75em;
		background: #ffffff;
		border-radius: 0.375em;
		border: 1px solid #d1d5db;
	}

	.total-size {
		font-weight: 600;
		color: #374151;
		font-size: 0.9em;
	}

	.file-warning {
		margin-top: 0.5em;
		padding: 0.5em;
		border-radius: 0.25em;
		font-size: 0.85em;
		line-height: 1.4;
	}

	.file-warning.warning {
		background: #fef3c7;
		border: 1px solid #f59e0b;
		color: #92400e;
	}

	.file-warning.info {
		background: #dbeafe;
		border: 1px solid #3b82f6;
		color: #1e40af;
	}

	.files-info ul {
		list-style-type: none;
		padding: 0;
		margin: 0;
	}

	.file-item {
		padding: 0.375em 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #f3f4f6;
	}

	.file-item:last-child {
		border-bottom: none;
	}

	.file-path {
		color: #6b7280;
		font-family: monospace;
		font-size: 0.9em;
		flex: 1;
	}

	.file-size {
		color: #9ca3af;
		font-size: 0.8em;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.25em;
	}

	.size-warning {
		color: #f59e0b;
		font-size: 1.1em;
	}

	.svg-section {
		border-top: 1px solid #e5e7eb;
		padding-top: 2em;
	}
</style>
