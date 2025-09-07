<script lang="ts">
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
</script>

<div class="text-editor" role="region" aria-label="Text editor">
	<div class="editor-header">
		<div class="file-label" title={path}>{path}</div>
		<button
			class="close-btn"
			onclick={handleCloseEditor}
			aria-label="Close editor">❌</button
		>
	</div>
	<textarea
		class="editor-textarea"
		bind:value={text}
		{oninput}
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
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		background: #ffffff;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5em 0.75em;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0.5em 0.5em 0 0;
	}

	.file-label {
		font-family: monospace;
		font-size: 0.9em;
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		padding-right: 0.5em;
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.1em;
	}

	.editor-textarea {
		flex: 1;
		width: 100%;
		resize: none;
		border: 0;
		outline: none;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
			"Liberation Mono", "Courier New", monospace;
		font-size: 0.8em;
		tab-size: 2;
		line-height: 1.4;
		padding: 0.75em;
		box-sizing: border-box;
		background: #ffffff;
	}
</style>
