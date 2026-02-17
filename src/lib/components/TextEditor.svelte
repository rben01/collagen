<script lang="ts">
	import { jsonnet } from "$lib/collagen-ts/jsonnet/cm-jsonnet-highlight";
	import { defaultKeymap, indentWithTab } from "@codemirror/commands";
	import { foldGutter, indentUnit } from "@codemirror/language";
	import { EditorView, keymap, lineNumbers } from "@codemirror/view";
	import { basicSetup } from "codemirror";
	import { onMount } from "svelte";
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";

	// Each displayer owns its toolbar; RightPane only provides the panel
	let {
		path,
		text = $bindable(),
		revision,
		handleCloseEditor,
	}: {
		path: string;
		text: string;
		revision: number;
		handleCloseEditor: () => void;
	} = $props();

	$inspect(text);

	let editorParent: HTMLElement;
	let editorView: EditorView;
	let lastRevision = $state(-1);

	onMount(() => {
		editorView = new EditorView({
			parent: editorParent!,
			doc: text,
			extensions: [
				basicSetup,
				lineNumbers(),
				foldGutter(),
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
		if (revision !== lastRevision) {
			lastRevision = revision;
			editorView.dispatch({
				changes: { from: 0, to: editorView.state.doc.length, insert: text },
			});
		}
	});
</script>

<div class="text-editor" role="region" aria-label="Text editor">
	<Toolbar ariaLabel="Text editor controls">
		<div class="control-group">
			<ControlButton
				action="minimize-editor"
				ariaLabel="Close editor"
				title="Close editor"
				onclick={handleCloseEditor}
			/>
		</div>
		<div class="file-label" title={path}>{path}</div>
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
		position: absolute;
		left: 0;
		right: 0;
		text-align: center;
		pointer-events: none;
		font-family: var(--mono-font-family);
		font-size: 0.9em;
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0 0.5em;
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
