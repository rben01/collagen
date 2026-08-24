<script lang="ts">
	import ControlButton from "../ControlButton.svelte";

	/** One editable attribute of the selection. */
	export interface AttrRow {
		key: string;
		/** What it comes to for the element that is selected. */
		value: string | number;
		/**
		 * How it is written, when a span of the manifest spells it out.
		 *
		 * For an element a loop produced, every instance shares one source
		 * object, so this is the loop body's own text -- `70 + i * 90` rather
		 * than `160`. Absent when the attribute arrives some other way, through
		 * a merge or an `attrs` that is itself computed.
		 */
		source?: string;
		/** True when that text is a plain value rather than something computed. */
		isLiteral: boolean;
	}

	let {
		tagLabel,
		attrs,
		groupSize,
		groupKind,
		canDetach,
		onSet,
		onSetExpression,
		onRemove,
		onDetach,
	}: {
		tagLabel: string | null;
		attrs: AttrRow[];
		groupSize: number;
		/** Why this element shares a source construct with others. */
		groupKind: "loop" | "shared" | null;
		canDetach: boolean;
		onSet: (key: string, value: string) => void;
		/** Replace an attribute's value with raw Jsonnet. */
		onSetExpression: (key: string, expression: string) => void;
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

	/**
	 * Rows the reader has asked to edit as code.
	 *
	 * A computed attribute is always shown this way. A literal is not, until
	 * asked: typing `i * 90` into a plain value field would write the string
	 * "i * 90", and guessing which is meant from the text would be worse -- a
	 * `fill` of `red` is a colour, not a variable named red.
	 */
	let asCode = $state<Record<string, boolean>>({});

	function editsAsCode(row: AttrRow): boolean {
		return row.source !== undefined && (!row.isLiteral || asCode[row.key]);
	}

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

		{#each sections as section (section.title)}
			<h4>{section.title}</h4>
			<dl>
				{#each section.rows as row (row.key)}
					<dt><label for="attr-{row.key}">{row.key}</label></dt>
					<dd class:wide={editsAsCode(row)}>
						{#if editsAsCode(row)}
							<input
								type="text"
								class="expression"
								id="attr-{row.key}"
								value={row.source}
								spellcheck="false"
								onchange={event =>
									onSetExpression(row.key, event.currentTarget.value)}
							/>
							{#if String(row.value) !== row.source}
								<span class="evaluated" title="What it comes to here"
									>= {row.value}</span
								>
							{/if}
						{:else if isColor(row.key, row.value)}
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
						{#if row.source !== undefined && row.isLiteral}
							<button
								type="button"
								class="as-code"
								class:on={asCode[row.key]}
								aria-pressed={asCode[row.key] ?? false}
								aria-label="Edit {row.key} as an expression"
								title="Edit as an expression, so it can vary with the loop"
								onclick={() =>
									(asCode = {
										...asCode,
										[row.key]: !asCode[row.key],
									})}>&fnof;</button
							>
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

	.empty {
		margin: 0.25rem 0;
		font-size: 0.8em;
		color: #6b7280;
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

	/* An expression needs the room to be read. Truncating `70 + i * 90` to
	   `70 + i *` defeats the point of showing it, so a code row drops onto its
	   own line and takes the whole width. */
	dd.wide {
		grid-column: 1 / -1;
		margin-bottom: 0.25rem;
	}

	/* An expression is code, so it is set in the mono face and given the room
	   that a value does not need. */
	input.expression {
		border-color: #c7d2fe;
		background: #f5f3ff;
	}

	.evaluated {
		flex: 0 0 auto;
		color: #6b7280;
		font-family: var(--mono-font-family);
		font-size: 0.75em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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

	.as-code {
		flex: 0 0 auto;
		padding: 0 0.3em;
		border: 0;
		border-radius: 0.25em;
		background: none;
		color: #9ca3af;
		font-family: var(--mono-font-family);
		font-style: italic;
		line-height: 1;
		cursor: pointer;
	}

	.as-code:hover {
		background: #f5f3ff;
		color: #4f46e5;
	}

	.as-code.on {
		background: #ede9fe;
		color: #4f46e5;
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
