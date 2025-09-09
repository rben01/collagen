<script lang="ts">
	import Toolbar from "./Toolbar.svelte";
</script>

<div class="intro-pane">
	<Toolbar ariaLabel="Viewer toolbar" />
	<div class="intro-body">
		<div class="welcome">
			<h2>Welcome to Collagen</h2>
			<p>
				To get started, drop some files and/or folders onto the file list on
				the left, or click below to start with a sample project. A valid
				project must contain a
				<code>collagen.json</code> or <code>collagen.jsonnet</code> file at its
				root, but you can also include images, font files, or even entire other
				Collagen projects by adding them to the project.
			</p>
			<!-- todo: add button get started -->
		</div>
	</div>
</div>

<style>
	.intro-pane {
		display: flex;
		flex: 1;
		min-height: 0;
		flex-direction: column;
	}
	.intro-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.welcome {
		text-align: center;
		padding: 2em 2.5em;
		max-width: 640px;
	}
	.welcome h2 {
		margin: 0 0 0.5em 0;
		color: #2563eb;
		font-weight: 700;
		font-size: 2.5rem;
	}
	.welcome p {
		color: #4b5563;
		margin: 0.5em 0 0 0;
		font-size: 1.2rem;
		line-height: 1.2em;
	}
	.welcome code {
		background: #f3f4f6;
		color: #111827;
		padding: 0.1em 0.3em;
		border-radius: 0.25em;
		font-size: 80%;
	}
</style>
