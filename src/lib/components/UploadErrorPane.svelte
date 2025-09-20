<script lang="ts">
	import type { FileUploadError } from "$lib/collagen-ts/filesystem/upload";

	let {
		errors,
		onDismiss = null,
	}: { errors: FileUploadError[]; onDismiss?: (() => void) | null } = $props();

	function handleDismiss() {
		if (onDismiss) {
			onDismiss();
		}
	}
</script>

<div
	class="upload-error-pane"
	role="region"
	aria-label="File upload issues"
	aria-live="polite"
>
	<div class="upload-error-header">
		<div class="header-left">
			<span class="error-icon" aria-hidden="true">⚠️</span>
			<span class="header-text">Upload issues</span>
		</div>
		{#if onDismiss}
			<button
				type="button"
				class="dismiss-button"
				onclick={handleDismiss}
				title="Dismiss upload issues"
				aria-label="Dismiss upload issues"
			>
				✕
			</button>
		{/if}
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
		justify-content: space-between;
		font-weight: 600;
		margin-bottom: 0.5em;
		gap: 0.5em;
	}

	.header-left {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
	}

	.error-icon {
		font-size: 1.2em;
	}

	.header-text {
		font-size: 0.95em;
	}

	.dismiss-button {
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 1em;
		line-height: 1;
		padding: 0.1em;
		border-radius: 0.25em;
	}

	.dismiss-button:hover,
	.dismiss-button:focus {
		background: rgba(185, 28, 28, 0.12);
		outline: none;
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
