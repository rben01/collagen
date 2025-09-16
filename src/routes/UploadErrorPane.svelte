<script lang="ts">
	import type { FileUploadError } from "./upload-helpers";

	let { errors }: { errors: FileUploadError[] } = $props();
</script>

<div
	class="upload-error-pane"
	role="region"
	aria-label="File upload issues"
	aria-live="polite"
>
	<div class="upload-error-header">
		<span class="error-icon" aria-hidden="true">⚠️</span>
		<span class="header-text">Upload error</span>
	</div>
	<ul>
		{#each errors as error}
			<li>
				{#if error.path}
					<code>{error.path}</code>: {error.message}
				{:else}
					{error.message}
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.upload-error-pane {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 0.5em;
		padding: 0.75em 1em;
		color: #b91c1c;
		flex-shrink: 0;
	}

	.upload-error-header {
		display: flex;
		align-items: center;
		gap: 0.5em;
		font-weight: 600;
		margin-bottom: 0.5em;
	}

	.error-icon {
		font-size: 1.2em;
	}

	.header-text {
		font-size: 0.95em;
	}

	ul {
		margin: 0;
		padding-left: 1.25em;
		font-size: 0.9em;
		line-height: 1.4;
	}

	li + li {
		margin-top: 0.35em;
	}

	code {
		background: #fee2e2;
		border-radius: 0.25em;
		padding: 0.1em 0.3em;
		font-size: 0.85em;
	}
</style>
