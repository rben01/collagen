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
				the left, or click “Create sample project” to start with a basic
				example. A valid project must contain a
				<code>collagen.json</code> or <code>collagen.jsonnet</code> file at its
				root, but you can also include images, font files, or even entire other
				Collagen projects by adding them to the project.
			</p>
			<div class="helpful-links">
				<p>Here are some links to get you started:</p>
				<ul>
					<li>
						<a
							href="https://github.com/rben01/collagen/blob/main/readme.adoc"
							target="_blank">What is this?</a
						>
					</li>
					<li>
						<a href="https://github.com/rben01/collagen" target="_blank"
							>GitHub repository</a
						>
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.intro-pane {
		--link-color: #006df1;
		--link-visited-color: #7e32f9;
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
		display: flex;
		flex-direction: column;
		flex-wrap: nowrap;
		gap: 1em;
		text-align: center;
		padding: 2em 2.5em;
		max-width: 640px;
		color: #3c4047;
		font-size: 1.2rem;
	}
	.welcome h2 {
		margin: 0;
		color: #2563eb;
		font-weight: 700;
		font-size: 2.5rem;
	}
	.welcome p {
		text-align: start;
		margin: 0;
		line-height: 1.2em;
		margin-bottom: 1em;
	}
	.welcome code {
		background: #f3f4f6;
		color: #111827;
		padding: 0.1em 0.3em;
		border-radius: 0.25em;
		font-size: 80%;
	}
	.helpful-links {
		text-align: start;
	}
	.helpful-links :is(p, ul) {
		margin: 0 auto;
	}
	.helpful-links p {
		margin-bottom: 0.5em;
	}
	.link-button {
		background: none;
		border: none;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		padding: 0;
	}
	.welcome :is(a, .link-button) {
		color: var(--link-color);
	}
	.welcome :is(a, .link-button):visited {
		color: var(--link-visited-color);
	}
</style>
