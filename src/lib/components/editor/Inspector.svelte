<script lang="ts">
	import ControlButton from "../ControlButton.svelte";
	import type { EditorState } from "./editor-state.svelte.js";

	/** One editable attribute of the selection. */
	export interface AttrRow {
		key: string;
		value: string | number;
	}

	let {
		editor,
		tagLabel,
		attrs,
		groupSize,
		groupKind,
		canDetach,
		onSet,
		onRemove,
		onDetach,
	}: {
		editor: EditorState;
		tagLabel: string | null;
		attrs: AttrRow[];
		groupSize: number;
		/** Why this element shares a source construct with others. */
		groupKind: "loop" | "shared" | null;
		canDetach: boolean;
		onSet: (key: string, value: string) => void;
		onRemove: (key: string) => void;
		onDetach: () => void;
	} = $props();

	/**
	 * Attributes grouped by what they do.
	 *
	 * sjsonnet sorts object keys alphabetically in its output, so the order they
	 * arrive in carries no relation to the source. Grouping sidesteps that
	 * rather than presenting a meaningless order as if it meant something.
	 */
	const GROUPS: { title: string; keys: RegExp }[] = [
		{
			title: "Geometry",
			keys: /^(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|d|points|transform)$/,
		},
		{ title: "Fill", keys: /^(fill|fill-opacity|fill-rule|opacity)$/ },
		{ title: "Stroke", keys: /^stroke/ },
		{ title: "Text", keys: /^(font|text|letter|word|dominant|alignment)/ },
	];

	const sections = $derived.by(() => {
		// Each attribute lands in the first group that claims it, so `taken`
		// tracks what is already placed.
		const taken: boolean[] = new Array(attrs.length).fill(false);
		const out: { title: string; rows: AttrRow[] }[] = [];

		for (const group of GROUPS) {
			const rows: AttrRow[] = [];
			for (let i = 0; i < attrs.length; i++) {
				if (!taken[i] && group.keys.test(attrs[i].key)) {
					rows.push(attrs[i]);
					taken[i] = true;
				}
			}
			if (rows.length > 0) out.push({ title: group.title, rows });
		}

		const other: AttrRow[] = [];
		for (let i = 0; i < attrs.length; i++) {
			if (!taken[i]) other.push(attrs[i]);
		}
		if (other.length > 0) out.push({ title: "Other", rows: other });
		return out;
	});

	/** Does this attribute read as a color the browser can show in a swatch? */
	function isColor(key: string, value: string | number): boolean {
		return (
			/(^fill$|^stroke$|color)/.test(key) &&
			typeof value === "string" &&
			/^#[0-9a-f]{3,8}$/i.test(value.trim())
		);
	}
</script>

<div class="inspector">
	<h3>Properties</h3>

	{#if editor.readOnlyReason}
		<p class="notice read-only">{editor.readOnlyReason}</p>
	{/if}

	{#if tagLabel === null}
		<p class="empty">Select something on the canvas.</p>
	{:else}
		<p class="tag">{tagLabel}</p>

		{#if groupSize > 1}
			<div class="group-banner">
				<p>
					{#if groupKind === "loop"}
						One of {groupSize} elements a loop produced. Editing changes all
						of them.
					{:else}
						One of {groupSize} elements built from the same source. Editing
						changes all of them.
					{/if}
				</p>
				{#if canDetach}
					<ControlButton
						action="detach"
						ariaLabel="Detach this element"
						title="Expand the loop so this element can be edited on its own"
						onclick={onDetach}
					/>
				{/if}
			</div>
		{/if}

		{#if editor.notice}
			<p class="notice">{editor.notice}</p>
		{/if}

		{#each sections as section (section.title)}
			<h4>{section.title}</h4>
			<dl>
				{#each section.rows as row (row.key)}
					<dt><label for="attr-{row.key}">{row.key}</label></dt>
					<dd>
						{#if isColor(row.key, row.value)}
							<input
								type="color"
								id="attr-{row.key}"
								value={String(row.value)}
								onchange={event =>
									onSet(row.key, event.currentTarget.value)}
							/>
						{:else}
							<input
								type="text"
								id="attr-{row.key}"
								value={String(row.value)}
								onchange={event =>
									onSet(row.key, event.currentTarget.value)}
							/>
						{/if}
						<button
							type="button"
							class="remove"
							aria-label="Remove {row.key}"
							title="Remove {row.key}"
							onclick={() => onRemove(row.key)}>&times;</button
						>
					</dd>
				{/each}
			</dl>
		{/each}

		{#if sections.length === 0}
			<p class="empty">This element has no attributes yet.</p>
		{/if}
	{/if}
</div>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid #e5e7eb;
	}

	h3 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	h4 {
		margin: 0.75rem 0 0.25rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #9ca3af;
	}

	.tag {
		margin: 0;
		font-family: var(--mono-font-family);
		font-size: 0.85em;
		color: #111827;
	}

	.empty,
	.notice {
		margin: 0.25rem 0;
		font-size: 0.8em;
		color: #6b7280;
	}

	.notice {
		padding: 0.4em 0.6em;
		border-radius: 0.375em;
		background: #fef2f2;
		color: #b91c1c;
	}

	.notice.read-only {
		background: #fffbeb;
		color: #92400e;
	}

	.group-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0;
		padding: 0.4em 0.6em;
		border-radius: 0.375em;
		background: #eff6ff;
	}

	.group-banner p {
		margin: 0;
		font-size: 0.8em;
		color: #1e40af;
	}

	dl {
		display: grid;
		grid-template-columns: minmax(0, 5.5em) 1fr;
		gap: 0.25rem 0.5rem;
		align-items: center;
		margin: 0;
	}

	dt {
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 0.78em;
		color: #6b7280;
	}

	dd {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		min-width: 0;
	}

	input[type="text"] {
		flex: 1;
		min-width: 0;
		padding: 0.2em 0.4em;
		border: 1px solid #e5e7eb;
		border-radius: 0.25em;
		font-family: var(--mono-font-family);
		font-size: 0.8em;
	}

	input[type="color"] {
		width: 2em;
		height: 1.6em;
		padding: 0;
		border: 1px solid #e5e7eb;
		border-radius: 0.25em;
		background: none;
	}

	input:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: 1px;
	}

	.remove {
		padding: 0 0.35em;
		border: 0;
		border-radius: 0.25em;
		background: none;
		color: #9ca3af;
		font-size: 1em;
		line-height: 1;
		cursor: pointer;
	}

	.remove:hover {
		background: #fef2f2;
		color: #b91c1c;
	}
</style>
