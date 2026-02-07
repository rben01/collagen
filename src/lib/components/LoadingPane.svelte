<script lang="ts">
	import Toolbar from "./Toolbar.svelte";

	let { controlsVisible }: { controlsVisible: boolean } = $props();
</script>

{#if controlsVisible}
	<div class="loading-pane">
		<Toolbar ariaLabel="Viewer toolbar" />
		<div class="loading-body">
			<p>Processing files...</p>
		</div>
	</div>
{:else}
	<div class="loading-body">
		<p>Processing files...</p>
	</div>
{/if}

<style>
	.loading-pane {
		display: flex;
		flex: 1;
		min-height: 0;
		flex-direction: column;
	}
	.loading-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff;
		color: #374151;
		font-size: 1.1em;
	}
</style>
