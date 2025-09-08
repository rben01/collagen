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
		padding: 1em;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		flex-wrap: wrap;
		gap: 1em;
	}

	/* Allow grouped controls inside toolbar to layout consistently */
	:global(.control-group) {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}
</style>
