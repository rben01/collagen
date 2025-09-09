<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		content,
		ariaLabelContent = "Pane content",
	}: { content: Snippet; ariaLabelContent?: string } = $props();
</script>

<div class="right-pane">
	<div class="panel" role="region" aria-label={ariaLabelContent}>
		{@render content?.()}
	</div>
</div>

<style>
	.right-pane {
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.panel {
		flex: 1;
		min-height: 0;
		display: flex;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		box-sizing: border-box;
		flex-direction: column;
		overflow: hidden; /* clip child toolbar backgrounds to rounded corners */
	}
</style>
