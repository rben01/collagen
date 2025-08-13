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
		console.log("🔄 Starting file processing...");
		const { files, folderName } = event.detail;
		console.log("📁 Files received:", Object.keys(files).length, "files");

		filesData = files;
		svgOutput = null;
		error = null;

		if (!wasm || !sjsonnet) {
			error = "Modules not loaded yet";
			console.log("❌ Modules not loaded");
			return;
		}

		try {
			loading = true;
			console.log("🚀 Starting processing pipeline...");

			// Validate file sizes before processing
			console.log("📊 Validating file sizes...");
			const MAX_SINGLE_FILE_SIZE = 20 * 1024 * 1024; // 20MB
			const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
			let totalSize = 0;

			for (const [path, file] of Object.entries(files)) {
				const fileSize = file.size;
				totalSize += fileSize;
				console.log(`📄 File: ${path} (${(fileSize / 1024).toFixed(1)}KB)`);

				if (fileSize > MAX_SINGLE_FILE_SIZE) {
					error = `File '${path}' is too large (${(fileSize / (1024 * 1024)).toFixed(1)}MB). Maximum file size is ${(MAX_SINGLE_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB. Try using smaller images.`;
					console.log("❌ File too large:", path);
					loading = false;
					return;
				}
			}

			if (totalSize > MAX_TOTAL_SIZE) {
				error = `Total file size is too large (${(totalSize / (1024 * 1024)).toFixed(1)}MB). Maximum total size is ${(MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(1)}MB. Try uploading fewer files or using smaller images.`;
				console.log(
					"❌ Total size too large:",
					(totalSize / (1024 * 1024)).toFixed(1),
					"MB",
				);
				loading = false;
				return;
			}

			console.log(
				"✅ File size validation passed. Total:",
				(totalSize / 1024).toFixed(1),
				"KB",
			);

			// Convert FileList to Map for WASM
			console.log("🗺️ Converting files to Map...");
			const fileMap = new Map();
			for (const [path, file] of Object.entries(files)) {
				// Ensure all paths have a leading slash (treat user folder as root)
				const normalizedPath = path.startsWith("/") ? path : "/" + path;
				fileMap.set(normalizedPath, file);
			}
			console.log("✅ File Map created with", fileMap.size, "entries");

			// Check for manifest and handle jsonnet compilation first
			console.log("🔍 Processing manifest...");
			const manifestType = await processManifest(fileMap, folderName);
			if (manifestType === "none") {
				error =
					"No manifest file found. Please include collagen.json or collagen.jsonnet";
				console.log("❌ No manifest found");
				loading = false;
				return;
			}
			console.log("✅ Manifest processed, type:", manifestType);

			console.log("📋 Final fileMap:", Array.from(fileMap.keys()));

			// Create in-memory filesystem after manifest processing (when fileMap is finalized)
			console.log("💾 Creating in-memory filesystem...");
			const fsHandle = await wasm.createInMemoryFs(fileMap);
			console.log(
				"✅ In-memory filesystem created with",
				fsHandle.getFileCount(),
				"files",
			);

			// Generate SVG
			console.log("🎨 Generating SVG...");
			const svg = wasm.generateSvg(fsHandle, "json");
			svgOutput = svg;
			console.log("✅ SVG generated successfully! Length:", svg.length);
			console.log(
				"🎯 Setting svgOutput, current value:",
				svgOutput ? svgOutput.substring(0, 100) + "..." : "null",
			);
			console.log("🎯 Loading state before finally:", loading);
		} catch (err) {
			console.error("Error processing files:", err);

			// Provide better error messages with specific guidance
			let errorMessage = "Error processing files: " + err.message;

			// Detect common error types and provide specific guidance
			if (err.message && typeof err.message === "string") {
				const msg = err.message.toLowerCase();

				if (msg.includes("out of bounds memory access") || msg.includes("memory")) {
					errorMessage =
						"❌ Memory limit exceeded. This usually happens with large images or too many files.\n\n" +
						"💡 Try these solutions:\n" +
						"• Use smaller images (compress them before uploading)\n" +
						"• Upload fewer files at once\n" +
						"• Reduce image resolution\n" +
						"• Use JPEG instead of PNG for photos\n\n" +
						"Technical details: " +
						err.message;
				} else if (msg.includes("createinmemoryfs")) {
					errorMessage =
						"❌ Failed to load files into memory.\n\n" +
						"💡 This often means your files are too large. Try:\n" +
						"• Using smaller images\n" +
						"• Uploading fewer files\n" +
						"• Compressing images before upload\n\n" +
						"Technical details: " +
						err.message;
				} else if (msg.includes("generatesvg")) {
					errorMessage =
						"❌ Failed to generate SVG output.\n\n" +
						"💡 This can happen when processing large images. Try:\n" +
						"• Using smaller images\n" +
						"• Reducing the number of images in your manifest\n" +
						"• Simplifying your SVG layout\n\n" +
						"Technical details: " +
						err.message;
				} else if (msg.includes("jsonnet")) {
					errorMessage =
						"❌ Jsonnet compilation failed.\n\n" +
						"💡 Check your jsonnet syntax:\n" +
						"• Verify all imports exist\n" +
						"• Check for syntax errors\n" +
						"• Ensure all referenced files are included\n\n" +
						"Technical details: " +
						err.message;
				}
			}

			error = errorMessage;
		} finally {
			loading = false;
			console.log("🏁 Finally block executed, loading set to false");
			console.log(
				"🎯 Final svgOutput state:",
				svgOutput ? "has content" : "null/empty",
			);
			console.log("🎯 Final error state:", error || "no error");
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
