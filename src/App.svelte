<script lang="ts">
	import FileUploader from "./FileUploader.svelte";
	import SvgDisplay from "./SvgDisplay.svelte";
	import {
		toCompatibleError,
		InMemoryFileSystem,
		FileContent,
	} from "./lib/collagen-ts/index.js";

	let error: string | null = null;
	let loading = false;
	let svgOutput: string | null = null;
	let filesData: InMemoryFileSystem | null = null;
	let svgDisplayComponent: any = null;

	async function handleFilesUploadedWithRoot(files: Map<string, File>, root?: string) {
		console.log("🔄 Starting file processing...");

		console.log("📁 Files received:", files.size, "files");
		if (root) {
			console.log("📂 Root folder:", root);
		}

		await handleFiles(await InMemoryFileSystem.create(files));
	}

	async function handleFiles(fs: InMemoryFileSystem) {
		console.log("🔄 Processing files...");

		try {
			loading = true;
			filesData = fs;
			svgOutput = null;
			error = null;

			// Normalize paths to ensure leading slash for TypeScript implementation
			console.log("🗺️ Normalizing file paths...");
			// Check for manifest and handle jsonnet compilation if needed
			console.log("🔍 Processing manifest...");

			// Generate SVG using the processed manifest data
			console.log("🎨 Generating SVG...");
			svgOutput = await fs.generateSvg();
			if (svgOutput) {
				console.log("✅ SVG generated successfully! Length:", svgOutput.length);
			}
		} catch (err) {
			console.error("Error processing files:", err);
			const compatError = toCompatibleError(err);
			error = compatError.message;
		} finally {
			loading = false;
		}
	}

	// Auto-focus SVG viewer when SVG is generated
	$: if (svgOutput && svgDisplayComponent) {
		// Use setTimeout to ensure the DOM is updated first
		setTimeout(() => {
			svgDisplayComponent.focus();
		}, 0);
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

	{#if loading}
		<div class="loading">
			<p>Processing files...</p>
		</div>
	{/if}

	<div class="upload-section">
		<FileUploader
			handleFilesUploaded={handleFilesUploadedWithRoot}
			{handleClearFiles}
			disabled={loading}
			externalError={error}
		/>
	</div>

	{#if filesData}
		<div class="files-info">
			<h3>Uploaded Files ({filesData?.getFileCount() || 0})</h3>

			<!-- File size summary and warnings -->
			{#each [(() => {
					try {
						if (!filesData) {
							return { totalSize: 0, warnings: [] };
						}

						let totalSize = 0;
						const largeFiles: FileContent[] = [];

						for (const file of filesData.files.values()) {
							// Ensure file exists and has size property
							if (file && typeof file.bytes.length === "number") {
								totalSize += file.bytes.length;
								if (file.bytes.length > 5 * 1024 * 1024) {
									// > 5MB
									largeFiles.push(file);
								}
							}
						}

						const warnings = [];

						if (totalSize > 25 * 1024 * 1024) {
							// > 25MB warning
							warnings.push( { type: "warning", message: `Total size: ${(totalSize / (1024 * 1024)).toFixed(1)}MB. Large uploads may fail due to memory limits.` }, );
						}

						if (largeFiles.length > 0) {
							warnings.push( { type: "info", message: `${largeFiles.length} large file(s) detected.` }, );
						}

						return { totalSize, warnings };
					} catch (e) {
						console.error("Error calculating file summary:", e);
						return { totalSize: 0, warnings: [] };
					}
				})()] as fileSummary}
				<div class="file-summary">
					<span class="total-size">
						<!-- TODO: this returns the wrong size -->
						Total: {(fileSummary.totalSize / 1024).toFixed(1)}KB
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
				{#each filesData.files || [] as [path, file]}
					<li class="file-item">
						<span class="file-path">{path}</span>
						<span class="file-size">
							{#if file && typeof file.bytes.length === "number"}
								{#if file.bytes.length > 1024 * 1024}
									{(file.bytes.length / (1024 * 1024)).toFixed(1)}MB
								{:else if file.bytes.length > 1024}
									{(file.bytes.length / 1024).toFixed(0)}KB
								{:else}
									{file.bytes.length}B
								{/if}
								{#if file.bytes.length > 10 * 1024 * 1024}
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
			<SvgDisplay svg={svgOutput} bind:this={svgDisplayComponent} />
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2em 2em 8em 2em;
		font-family:
			-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell,
			sans-serif;
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
