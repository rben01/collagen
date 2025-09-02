<script lang="ts">
	import type {
		InMemoryFileSystem,
		FileContent,
	} from "$lib/collagen-ts/index.js";

	let { filesData }: { filesData: { fs: InMemoryFileSystem } } = $props();

	// Calculate file statistics
	const fileStats = $derived(() => {
		if (!filesData) {
			return { totalSize: 0, warnings: [] };
		}

		let totalSize = 0;
		const largeFiles: FileContent[] = [];

		for (const file of filesData.fs.files.values()) {
			if (file && typeof file.bytes.length === "number") {
				totalSize += file.bytes.length;
				if (file.bytes.length > 5 * 1024 * 1024) {
					largeFiles.push(file);
				}
			}
		}

		const warnings = [];

		if (totalSize > 25 * 1024 * 1024) {
			warnings.push({
				type: "warning",
				message: `Total size: ${(totalSize / (1024 * 1024)).toFixed(1)}MB. Large uploads may fail due to memory limits.`,
			});
		}

		if (largeFiles.length > 0) {
			warnings.push({
				type: "info",
				message: `${largeFiles.length} large file(s) detected.`,
			});
		}

		return { totalSize, warnings };
	});

	function formatFileSize(bytes: number): string {
		if (bytes > 1024 * 1024) {
			return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
		} else if (bytes > 1024) {
			return `${(bytes / 1024).toFixed(0)}KB`;
		} else {
			return `${bytes}B`;
		}
	}
</script>

<div class="file-list" role="region" aria-label="File information">
	<div class="file-list-header">
		<h3>Files ({filesData.fs.getFileCount()})</h3>

		<div class="file-summary">
			<div class="total-size">
				Total: {(fileStats().totalSize / 1024).toFixed(1)}KB
			</div>

			{#each fileStats().warnings as warning}
				<div class="file-warning {warning.type}">
					{#if warning.type === "warning"}⚠️{:else}💡{/if}
					{warning.message}
				</div>
			{/each}
		</div>
	</div>

	<div class="files-container">
		{#each filesData.fs.files as [path, file]}
			<div class="file-item">
				<div class="file-path" title={path}>{path}</div>
				<div class="file-size">
					{#if file && typeof file.bytes.length === "number"}
						{formatFileSize(file.bytes.length)}
						{#if file.bytes.length > 10 * 1024 * 1024}
							<span class="size-warning" title="Large file">⚠️</span>
						{/if}
					{:else}
						Unknown size
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.file-list {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		overflow-y: auto;
	}

	.file-list-header {
		padding: 1em;
		border-bottom: 1px solid #e5e7eb;
		background: #ffffff;
		border-radius: 0.5em 0.5em 0 0;
		flex-shrink: 0;
	}

	.file-list-header h3 {
		margin: 0 0 0.75em 0;
		color: #374151;
		font-size: 1.1em;
		font-weight: 600;
	}

	.file-summary {
		font-size: 0.875em;
	}

	.total-size {
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.5em;
	}

	.file-warning {
		padding: 0.5em 0.75em;
		border-radius: 0.375em;
		font-size: 0.8em;
		line-height: 1.3;
		margin-bottom: 0.25em;
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

	.files-container {
		flex: 1;
		padding: 0.5em;
	}

	.file-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5em 0.75em;
		margin-bottom: 0.125em;
		background: #ffffff;
		border: 1px solid #f3f4f6;
		border-radius: 0.375em;
		transition: background-color 0.2s;
	}

	.file-item:hover {
		background: #f8f9fa;
		border-color: #e5e7eb;
	}

	.file-path {
		color: #4b5563;
		font-family: monospace;
		font-size: 0.875em;
		flex: 1;
		margin-right: 0.75em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.file-size {
		color: #6b7280;
		font-size: 0.8em;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.25em;
		flex-shrink: 0;
	}

	.size-warning {
		color: #f59e0b;
		font-size: 1.1em;
	}

	/* Scrollbar styling */
	.files-container::-webkit-scrollbar {
		width: 6px;
	}

	.files-container::-webkit-scrollbar-track {
		background: #f1f5f9;
		border-radius: 3px;
	}

	.files-container::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 3px;
	}

	.files-container::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}
</style>
