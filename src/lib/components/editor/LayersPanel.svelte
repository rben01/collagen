<script lang="ts">
	import type { LayerNode } from "./layers.js";
	import type { EditorState } from "./editor-state.svelte.js";

	let {
		layers,
		editor,
		onReorder,
		onToggleVisible,
	}: {
		layers: LayerNode[];
		editor: EditorState;
		/** Move a child of `parentPath` from one index to another. */
		onReorder: (parentPath: string, from: number, to: number) => void;
		/** Show or hide one element. */
		onToggleVisible: (path: string, visible: boolean) => void;
	} = $props();

	let dragging = $state<{ parentPath: string; index: number } | null>(null);
	/** The row the pointer is currently over, so the landing place is visible. */
	let dropTarget = $state<string | null>(null);

	/** Can the dragged row land on this one? Only siblings can be reordered. */
	function canDropOn(node: LayerNode): boolean {
		return (
			dragging !== null &&
			dragging.parentPath === node.parentPath &&
			dragging.index !== node.index
		);
	}

	function dragOver(event: DragEvent, node: LayerNode) {
		if (!canDropOn(node)) return;
		// Only a prevented dragover marks a valid drop target.
		event.preventDefault();
		dropTarget = node.path;
	}

	function drop(node: LayerNode) {
		const source = dragging;
		endDrag();
		if (!source || source.parentPath !== node.parentPath) return;
		if (source.index === node.index) return;
		onReorder(node.parentPath, source.index, node.index);
	}

	/**
	 * Forget the drag.
	 *
	 * Needed on `dragend` as well as on drop: a drag abandoned with Escape
	 * fires no drop, and leaving `dragging` set meant the next row released on
	 * would reorder as though the abandoned drag were still in progress.
	 */
	function endDrag() {
		dragging = null;
		dropTarget = null;
	}
</script>

{#snippet row(node: LayerNode)}
	<li>
		<div
			class="layer"
			class:selected={editor.selectedPath === node.path}
			class:grouped={node.groupSize > 1}
			class:dragging={dragging?.parentPath === node.parentPath &&
				dragging?.index === node.index}
			class:drop-target={dropTarget === node.path}
			draggable="true"
			role="treeitem"
			aria-selected={editor.selectedPath === node.path}
			tabindex="-1"
			onclick={() => editor.select(node.path)}
			onkeydown={event => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					editor.select(node.path);
				}
			}}
			onmouseenter={() => (editor.hoveredPath = node.path)}
			onmouseleave={() => (editor.hoveredPath = null)}
			ondragstart={() =>
				(dragging = { parentPath: node.parentPath, index: node.index })}
			ondragend={endDrag}
			ondragover={event => dragOver(event, node)}
			ondragleave={() => {
				if (dropTarget === node.path) dropTarget = null;
			}}
			ondrop={() => drop(node)}
			style:--depth={node.depth}
		>
			<span class="name">{node.label}</span>
			{#if node.canHide}
				<button
					type="button"
					class="visibility"
					class:hidden={!node.visible}
					aria-label={node.visible
						? `Hide ${node.label}`
						: `Show ${node.label}`}
					title={node.visible ? "Hide" : "Show"}
					onclick={event => {
						event.stopPropagation();
						onToggleVisible(node.path, !node.visible);
					}}>{node.visible ? "◉" : "◎"}</button
				>
			{/if}
			{#if node.groupSize > 1}
				<span
					class="badge"
					title="One of {node.groupSize} elements from the same source"
				>
					&#8635;{node.groupSize}
				</span>
			{/if}
		</div>
		{#if node.children.length > 0}
			<ul>
				{#each node.children as child (child.path)}
					{@render row(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="layers">
	<h3>Layers</h3>
	{#if layers.length === 0}
		<p class="empty">Nothing to show yet.</p>
	{:else}
		<ul role="tree" aria-label="Layers">
			{#each layers as node (node.path)}
				{@render row(node)}
			{/each}
		</ul>
	{/if}
</div>

<style>
	.layers {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 0.5rem 0.25rem;
	}

	h3 {
		margin: 0 0 0.5rem 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.empty {
		margin: 0 0.5rem;
		color: #6b7280;
		font-size: 0.85em;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.layer {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25em 0.5em 0.25em calc(0.5em + var(--depth) * 0.75em);
		border-radius: 0.375em;
		font-size: 0.85em;
		color: #374151;
		cursor: pointer;
		user-select: none;
	}

	.layer:hover {
		background: #f3f4f6;
	}

	.layer.selected {
		background: #2563eb;
		color: #fff;
	}

	.layer.dragging {
		opacity: 0.4;
	}

	/* Where the row will land. A line rather than a fill, so it reads as a
	   position between rows and not as a second selection. */
	.layer.drop-target {
		box-shadow: inset 0 -2px 0 #2563eb;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.visibility {
		margin-left: auto;
		padding: 0 0.2em;
		border: 0;
		border-radius: 0.25em;
		background: none;
		color: #9ca3af;
		font-size: 0.9em;
		line-height: 1;
		cursor: pointer;
	}

	.visibility.hidden {
		color: #2563eb;
	}

	.layer.selected .visibility {
		color: rgb(255 255 255 / 80%);
	}

	.badge {
		margin-left: 0.25rem;
		padding: 0 0.35em;
		border-radius: 0.75em;
		background: #e5e7eb;
		color: #374151;
		font-size: 0.85em;
		font-variant-numeric: tabular-nums;
	}

	.layer.selected .badge {
		background: rgb(255 255 255 / 25%);
		color: #fff;
	}
</style>
