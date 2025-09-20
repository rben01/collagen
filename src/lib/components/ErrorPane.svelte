<script lang="ts">
	import Toolbar from "./Toolbar.svelte";
	let { message }: { message: string } = $props();
</script>

<div class="error-pane">
	<Toolbar ariaLabel="Viewer toolbar" />
	<div class="error-body">
		<div class="error-content error-message">
			<span class="error-icon">⚠️</span>
			<p class="error-description">{message}</p>
		</div>
	</div>
</div>

<style>
	.error-pane {
		display: flex;
		flex: 1;
		min-height: 0;
		flex-direction: column;
	}
	.error-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fef2f2;
		color: #dc2626;
	}
	.error-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75em;
		text-align: center;
		max-width: 600px;
		padding: 1em;
	}
	.error-icon {
		font-size: 1.5em;
		flex-shrink: 0;
	}
	.error-description {
		margin: 0;
		line-height: 1.4;
		font-size: 1em;
	}
</style>
