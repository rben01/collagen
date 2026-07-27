<script lang="ts">
	export interface Callout {
		marker: number;
		text: string;
	}

	let {
		code,
		filename = null,
		language = "jsonnet",
		callouts = [],
	}: {
		code: string;
		filename?: string | null;
		language?: string;
		callouts?: Callout[];
	} = $props();
</script>

<div class="code-block">
	{#if filename}
		<div class="filename">{filename}</div>
	{/if}
	<pre class="code" data-language={language}><code>{code}</code></pre>
	{#if callouts.length > 0}
		<ol class="callouts">
			{#each callouts as callout (callout.marker)}
				<li value={callout.marker}>{callout.text}</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.code-block {
		margin: 1.25rem 0;
	}

	.filename {
		font-family: var(--mono-font-family);
		font-size: 0.8rem;
		color: #6b7280;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-bottom: none;
		border-radius: 0.5rem 0.5rem 0 0;
		padding: 0.4rem 0.75rem;
	}

	.filename + .code {
		border-radius: 0 0 0.5rem 0.5rem;
	}

	.code {
		margin: 0;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1rem;
		overflow-x: auto;
		font-family: var(--mono-font-family);
		font-size: 0.85rem;
		line-height: 1.55;
		tab-size: 2;
	}

	.code code {
		background: none;
		padding: 0;
		font-size: inherit;
		color: #111827;
		white-space: pre;
	}

	.callouts {
		margin: 0.75rem 0 0;
		padding-left: 1.5rem;
		font-size: 0.9rem;
		color: #4b5563;
	}

	.callouts li {
		margin-bottom: 0.25rem;
	}
</style>
