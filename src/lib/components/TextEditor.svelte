<script lang="ts">
	import { jsonnet } from "$lib/collagen-ts/jsonnet/cm-jsonnet-highlight";
	import { defaultKeymap, indentWithTab } from "@codemirror/commands";
	import { indentUnit } from "@codemirror/language";
	import { EditorView, keymap } from "@codemirror/view";
	import { basicSetup } from "codemirror";
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";
	import { onMount } from "svelte";

	// Each displayer owns its toolbar; RightPane only provides the panel
	let {
		path,
		text = $bindable(),
		handleCloseEditor,
	}: { path: string; text: string; handleCloseEditor: () => void } = $props();

	$inspect(text);

	function handleTouchMove(event: TouchEvent) {
		// Prevent page scrolling when scrolling within textarea
		event.stopPropagation();
	}

	let editorParent: HTMLElement;
	let editorView: EditorView;

	onMount(() => {
		editorView = new EditorView({
			parent: editorParent!,
			doc: text,
			extensions: [
				basicSetup,
				EditorView.lineWrapping,
				indentUnit.of("\t"),
				keymap.of([...defaultKeymap, indentWithTab]),
				jsonnet(),
				EditorView.updateListener.of(update => {
					if (update.docChanged) {
						text = update.state.doc.toString();
					}
				}),
			],
		});
	});

	$effect(() => {
		editorView.dispatch({
			changes: { from: 0, to: editorView.state.doc.length, insert: text },
		});
	});
</script>

<div class="text-editor" role="region" aria-label="Text editor">
	<Toolbar ariaLabel="Text editor controls">
		<div class="file-label" title={path}>{path}</div>
		<div class="control-group">
			<ControlButton
				action="minimize-editor"
				ariaLabel="Close editor"
				title="Close editor"
				onclick={handleCloseEditor}
			/>
		</div>
	</Toolbar>
	<div class="codemirror-parent" bind:this={editorParent}></div>
</div>

<style>
	.text-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		background: #ffffff;
	}

	.file-label {
		font-family: var(--mono-font-family);
		font-size: 0.9em;
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		padding-right: 0.5em;
	}

	.editor-textarea {
		flex: 1;
		width: 100%;
		resize: none;
		border: 0;
		outline: none;
		font-family: var(--mono-font-family);
		font-size: 0.9em;
		tab-size: 2;
		line-height: 1.25;
		padding: 0.75em;
		box-sizing: border-box;
		background: #ffffff;
	}

	.codemirror-parent {
		height: 100%;
		overflow: auto;
	}

	.codemirror-parent :global(.cm-scroller) {
		overflow: auto;
		font-family: var(--mono-font-family);
		font-size: 14px;
	}
</style>
