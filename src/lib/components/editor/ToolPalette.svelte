<script lang="ts">
	import ControlButton from "../ControlButton.svelte";
	import type { ButtonAction } from "../ButtonIcon.js";
	import type { EditorState, Tool } from "./editor-state.svelte.js";

	let { editor }: { editor: EditorState } = $props();

	const TOOLS: {
		tool: Tool;
		action: ButtonAction;
		label: string;
		key: string;
	}[] = [
		{ tool: "select", action: "tool-select", label: "Select", key: "V" },
		{ tool: "rect", action: "tool-rect", label: "Rectangle", key: "R" },
		{ tool: "ellipse", action: "tool-ellipse", label: "Ellipse", key: "E" },
		{ tool: "line", action: "tool-line", label: "Line", key: "L" },
		{ tool: "text", action: "tool-text", label: "Text", key: "T" },
		{ tool: "pan", action: "tool-pan", label: "Pan", key: "H" },
	];
</script>

<div
	class="palette"
	role="toolbar"
	aria-label="Drawing tools"
	aria-orientation="vertical"
>
	{#each TOOLS as { tool, action, label, key } (tool)}
		<ControlButton
			{action}
			ariaLabel={label}
			title="{label} ({key})"
			active={editor.tool === tool}
			onclick={() => (editor.tool = tool)}
		/>
	{/each}
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.375rem;
		background: #f9fafb;
		border-right: 1px solid #e5e7eb;
		flex: 0 0 auto;
	}
</style>
