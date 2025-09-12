<script lang="ts">
	import Toolbar from "./Toolbar.svelte";
	import ControlButton from "./ControlButton.svelte";

	// Each displayer owns its toolbar; RightPane only provides the panel
	let {
		path,
		text = $bindable(),
		onUpdateText,
		handleCloseEditor,
	}: {
		path: string;
		text: string | null;
		onUpdateText: (newText: string) => void;
		handleCloseEditor: () => void;
	} = $props();

	function oninput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		onUpdateText(target.value);
	}

	function handleTouchMove(event: TouchEvent) {
		// Prevent page scrolling when scrolling within textarea
		event.stopPropagation();
	}
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
	<textarea
		class="editor-textarea"
		bind:value={text}
		{oninput}
		ontouchmove={handleTouchMove}
		spellcheck={false}
		aria-label="Editable text file contents"
	></textarea>
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
</style>
