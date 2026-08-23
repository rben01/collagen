<script lang="ts">
	import {
		highlightJsonnet,
		type Token,
	} from "$lib/collagen-ts/jsonnet/highlight-static.js";

	export interface Callout {
		marker: number;
		text: string;
	}

	let {
		code,
		filename = null,
		language = "jsonnet",
		callouts = [],
		id,
	}: {
		code: string;
		filename?: string | null;
		language?: string;
		callouts?: Callout[];
		/** Unique per page; namespaces the badge/note anchor ids. */
		id: string;
	} = $props();

	/**
	 * Callout markers are written into the samples as real Jsonnet comments
	 * (`// (1)`) so the snippets stay copy-pasteable and runnable. They are
	 * stripped here and re-rendered as badges, so the displayed code is clean and
	 * each marker links to its note — what Asciidoctor's `<1>` callouts did.
	 */
	const MARKER = /\s*\/\/ \((\d+)\)\s*$/;

	/* Load-bearing line separator inside <pre>. Kept in a constant because an
	   inline string mustache trips svelte/no-useless-mustaches, and it cannot
	   simply be dropped — without it every line runs together. */
	const NEWLINE = "\n";

	interface Line {
		tokens: Token[];
		marker: number | null;
	}

	const lines: Line[] = $derived.by(() => {
		const out: Line[] = [];
		for (const raw of code.split("\n")) {
			const match = raw.match(MARKER);
			const text = match ? raw.slice(0, match.index) : raw;
			out.push({
				tokens:
					language === "jsonnet"
						? highlightJsonnet(text)
						: [{ text, className: null }],
				marker: match ? Number(match[1]) : null,
			});
		}
		return out;
	});
</script>

<div class="code-block">
	{#if filename}
		<div class="filename">{filename}</div>
	{/if}
	<pre class="code" data-language={language}><code
			>{#each lines as line, i (i)}{#each line.tokens as token, j (j)}{#if token.className}<span
							class={token.className}>{token.text}</span
						>{:else}{token.text}{/if}{/each}{#if line.marker !== null}<a
						class="callout-marker"
						href="#{id}-note-{line.marker}"
						id="{id}-marker-{line.marker}"
						aria-label="Callout {line.marker}">{line.marker}</a
					>{/if}{#if i < lines.length - 1}{NEWLINE}{/if}{/each}</code
		></pre>
	{#if callouts.length > 0}
		<ol class="callouts">
			{#each callouts as callout (callout.marker)}
				<li id="{id}-note-{callout.marker}" value={callout.marker}>
					<a class="callout-backref" href="#{id}-marker-{callout.marker}"
						>{callout.marker}</a
					>
					<span>{callout.text}</span>
				</li>
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

	/* Numbered badge sitting where the `// (n)` comment used to be. Excluded
	   from selection so copying a sample yields runnable Jsonnet rather than
	   code with stray digits welded onto the ends of lines. */
	.callout-marker,
	.callout-backref {
		user-select: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25em;
		height: 1.25em;
		margin-left: 0.75em;
		border-radius: 50%;
		background: #2563eb;
		color: #fff;
		font-size: 0.8em;
		font-family: var(--sans-font-family);
		font-weight: 600;
		line-height: 1;
		text-decoration: none;
		vertical-align: middle;
	}

	.callout-marker:hover,
	.callout-backref:hover {
		background: #1d4ed8;
		text-decoration: none;
	}

	.callouts {
		margin: 0.75rem 0 0;
		padding-left: 0;
		list-style: none;
		font-size: 0.9rem;
		color: #4b5563;
	}

	.callouts li {
		display: flex;
		align-items: baseline;
		gap: 0.5em;
		margin-bottom: 0.35rem;
	}

	.callout-backref {
		margin-left: 0;
		flex-shrink: 0;
	}

	/* Lezer highlight classes, emitted by classHighlighter. */
	.code :global(.tok-comment) {
		color: #6b7280;
		font-style: italic;
	}
	.code :global(.tok-string) {
		color: #047857;
	}
	.code :global(.tok-number) {
		color: #b45309;
	}
	.code :global(.tok-bool),
	.code :global(.tok-null),
	.code :global(.tok-keyword),
	.code :global(.tok-controlKeyword),
	.code :global(.tok-self) {
		color: #7c3aed;
	}
	.code :global(.tok-variableName) {
		color: #111827;
	}
	.code :global(.tok-function) {
		color: #2563eb;
	}
	.code :global(.tok-attributeName) {
		color: #0369a1;
	}
	.code :global(.tok-punctuation),
	.code :global(.tok-paren),
	.code :global(.tok-bracket),
	.code :global(.tok-brace) {
		color: #6b7280;
	}
</style>
