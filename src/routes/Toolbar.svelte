<script lang="ts">
	import type { Snippet } from "svelte";

	let { ariaLabel, children }: { ariaLabel?: string; children?: Snippet } =
		$props();
</script>

<div class="toolbar" role="toolbar" aria-label={ariaLabel}>
	{@render children?.()}
</div>

<style>
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5em 0.75em;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		border-top-left-radius: 0.5em;
		border-top-right-radius: 0.5em;
		flex-wrap: wrap;
		gap: 1em;
		min-height: calc(1em + 20px);
	}

	/* Normalize heading margins inside toolbars to keep height consistent */
	:global(
		.toolbar h1,
		.toolbar h2,
		.toolbar h3,
		.toolbar h4,
		.toolbar h5,
		.toolbar h6
	) {
		margin: 0;
	}

	/* Allow grouped controls inside toolbar to layout consistently */
	:global(.control-group) {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}
</style>
