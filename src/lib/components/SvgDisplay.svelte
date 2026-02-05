<script lang="ts">
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";
	import ViewerCore from "./ViewerCore.svelte";
	import {
		BACKGROUND_STYLES,
		getViewerKeyAction,
		isTypingInInput,
	} from "./viewer/index.js";
	import { base64Encode } from "$lib/collagen-ts";

	export function focus() {
		viewerCore?.focus();
	}

	let {
		svg,
		compact,
		controlsVisible = true,
		editorPath = null,
		scale = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		showRawSvg = $bindable(false),
		showInstructions = $bindable(false),
	}: {
		svg: string;
		compact: boolean;
		controlsVisible?: boolean;
		editorPath?: string | null;
		scale?: number;
		panX?: number;
		panY?: number;
		showRawSvg?: boolean;
		showInstructions?: boolean;
	} = $props();

	let viewerCore: ViewerCore | null = $state(null);
	let backgroundStyleIndex = $state(1);

	const TEXT_ENCODER = new TextEncoder();

	const svgDimensions = $derived.by(() => {
		const viewBoxMatch = svg.match(/viewBox="([^"]*)"/);
		if (!viewBoxMatch) return null;

		const viewBoxValues = viewBoxMatch[1].trim().split(/\s+/g).map(Number);
		if (viewBoxValues.length !== 4) return null;

		const [x, y, width, height] = viewBoxValues;
		return { x, y, width, height, aspectRatio: width / height };
	});

	function toggleRawSvg() {
		showRawSvg = !showRawSvg;
	}

	function toggleInstructions() {
		showInstructions = !showInstructions;
	}

	function downloadSvg() {
		const blob = new Blob([svg], { type: "image/svg+xml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "collagen-output.svg";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		viewerCore?.showToast("SVG downloaded.");
	}

	function copyToClipboard() {
		navigator.clipboard
			.writeText(svg)
			.then(() => viewerCore?.showToast("SVG copied to clipboard."))
			.catch(err => {
				console.error("Failed to copy SVG to clipboard:", err);
				viewerCore?.showToast("Failed to copy SVG to clipboard", "error");
			});
	}

	function handleRawSvgTouchMove(event: TouchEvent) {
		event.stopPropagation();
	}

	function handleRawSvgKeyDown(event: KeyboardEvent) {
		if (!showRawSvg) return;
		if (isTypingInInput()) return;

		const action = getViewerKeyAction(event, false);
		if (!action) return;

		let handled = true;
		switch (action.type) {
			case "toggle-raw":
				toggleRawSvg();
				break;
			case "toggle-help":
				if (!editorPath) toggleInstructions();
				else handled = false;
				break;
			case "copy":
				copyToClipboard();
				break;
			case "download":
				downloadSvg();
				break;
			default:
				handled = false;
		}

		if (handled) event.preventDefault();
	}
</script>

<svelte:window on:keydown={handleRawSvgKeyDown} />

<div class="viewer-display" class:compact>
	{#if controlsVisible}
		<Toolbar ariaLabel="SVG viewer controls">
			<div class="control-group">
				<ControlButton
					action="zoom-in"
					title="Zoom In (Keyboard: +)"
					ariaLabel="Zoom in, keyboard shortcut plus key"
					onclick={() => viewerCore?.zoomIn()}
					disabled={showRawSvg}
				/>
				<ControlButton
					action="zoom-out"
					title="Zoom Out (Keyboard: -)"
					ariaLabel="Zoom out, keyboard shortcut minus key"
					onclick={() => viewerCore?.zoomOut()}
					disabled={showRawSvg}
				/>
				<ControlButton
					action="reset-view"
					title="Reset View (Keyboard: 0)"
					ariaLabel="Reset view, keyboard shortcut zero key"
					onclick={() => viewerCore?.resetView()}
					disabled={showRawSvg}
				/>
				<span class="zoom-level">{Math.round(scale * 100)}%</span>
			</div>

			<div class="control-group">
				<ControlButton
					action="help"
					active={showInstructions}
					title="Toggle Usage Instructions (Keyboard: ?)"
					ariaLabel="Toggle usage instructions, keyboard shortcut question mark key"
					onclick={toggleInstructions}
				/>
				<ControlButton
					action="background"
					title="Change Background (Keyboard: B)"
					ariaLabel="Change background style from {BACKGROUND_STYLES[
						backgroundStyleIndex
					].name} to {BACKGROUND_STYLES[
						(backgroundStyleIndex + 1) % BACKGROUND_STYLES.length
					].name}, keyboard shortcut B key"
					onclick={() => viewerCore?.cycleBackgroundStyle()}
					disabled={showRawSvg}
				/>
				<ControlButton
					action="toggle-view"
					active={showRawSvg}
					title="Toggle Code View (Keyboard: V)"
					ariaLabel="Toggle between preview and code view, keyboard shortcut V key"
					onclick={toggleRawSvg}
				/>
				<ControlButton
					action="copy"
					title="Copy SVG to Clipboard (Keyboard: C)"
					ariaLabel="Copy SVG to clipboard, keyboard shortcut C key"
					onclick={copyToClipboard}
				/>
				<ControlButton
					action="export-svg"
					title="Download SVG (Keyboard: S)"
					ariaLabel="Download SVG file, keyboard shortcut S key"
					onclick={downloadSvg}
				/>
			</div>
		</Toolbar>
	{/if}

	{#if showInstructions && !showRawSvg}
		<div class="instructions" role="region" aria-label="Usage instructions">
			<div class="instructions-content">
				<h4>How to Use the SVG Viewer</h4>

				<div class="instructions-grid">
					<div class="instruction-section">
						<h5>Zoom & Pan</h5>
						<ul>
							<li>
								<strong>Mouse</strong>: Drag to pan, Ctrl/Cmd+scroll to
								zoom (Safari users: pinch to zoom)
							</li>
							<li><strong>Touch</strong>: Drag to pan, pinch to zoom</li>
							<li>
								<strong>Shift</strong><span
									style="position:relative;bottom:0.1em;"
									>&ThinSpace;+&ThinSpace;</span
								><strong>arrows</strong>: Pan (when viewer focused)
							</li>
							<li><strong>+/-</strong> keys: Zoom in/out</li>
							<li><strong>0</strong> key: Reset view</li>
						</ul>
					</div>

					<div class="instruction-section">
						<h5>Actions</h5>
						<ul>
							<li>
								<strong>Focus</strong> the SVG viewer to enable panning
							</li>
							<li><strong>B</strong> key: Change background style</li>
							<li><strong>?</strong> key: Toggle help instructions</li>
							<li><strong>V</strong> key: Toggle code view</li>
							<li><strong>C</strong> key: Copy SVG to clipboard</li>
							<li><strong>S</strong> key: Download SVG file</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if showRawSvg}
		<div
			class="raw-svg"
			role="region"
			aria-label="The raw SVG code"
			ontouchmove={handleRawSvgTouchMove}
		>
			<pre><code>{svg}</code></pre>
		</div>
	{:else}
		<ViewerCore
			bind:this={viewerCore}
			kind="svg"
			contentWidth={svgDimensions?.width ?? 0}
			contentHeight={svgDimensions?.height ?? 0}
			bind:scale
			bind:panX
			bind:panY
			bind:backgroundStyleIndex
			onCopy={copyToClipboard}
			onDownload={downloadSvg}
			onToggleRaw={toggleRawSvg}
			onToggleHelp={editorPath ? undefined : toggleInstructions}
			{compact}
			ariaLabel="Interactive SVG viewer"
		>
			{#snippet children({ constrainedDimensions })}
				<iframe
					title="Generated SVG"
					width={constrainedDimensions.width}
					height={constrainedDimensions.height}
					style="border:none;image-rendering:crisp-edges;"
					src="data:image/svg+xml;base64,{base64Encode(
						TEXT_ENCODER.encode(svg),
					)}"
				></iframe>
			{/snippet}
		</ViewerCore>
	{/if}
</div>

<style>
	.viewer-display {
		--focus-indicator-thickness: 2px;

		border: none;
		border-radius: 0;
		overflow: hidden;
		background: transparent;
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.zoom-level {
		font-family: monospace;
		font-size: 0.875em;
		color: #6b7280;
		min-width: 3em;
		text-align: center;
	}

	.raw-svg {
		flex: 1;
		overflow: auto;
		background: #f8f9fa;
	}

	.raw-svg pre {
		margin: 0;
		padding: 1em;
		font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
		font-size: 0.875em;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.raw-svg code {
		color: #374151;
	}

	/* Instructions Styles */
	.instructions {
		background: #f8fafc;
		border-bottom: 1px solid #e5e7eb;
		padding: 1.5em;
		margin: 0;
	}

	.instructions-content h4 {
		margin: 0 0 1em 0;
		color: #374151;
		font-size: 1.1em;
		font-weight: 600;
	}

	.instructions-grid {
		display: flex;
		flex-wrap: wrap;
		margin-bottom: 1em;
		align-items: flex-start;
		justify-content: space-around;
		column-gap: 30px;
		row-gap: 16px;
	}

	.instruction-section {
		min-width: 240px;
		flex: 1;
	}

	.instruction-section h5 {
		margin: 0 0 0.75em 0;
		color: #1f2937;
		font-size: 0.95em;
		font-weight: 600;
	}

	.instruction-section ul {
		margin: 0;
		padding-left: 1.2em;
		list-style: disc;
	}

	.instruction-section li {
		margin-bottom: 0.4em;
		font-size: 0.9em;
		line-height: 1.4;
		color: #4b5563;
	}

	.instruction-section strong {
		color: #374151;
		font-weight: 600;
		font-family: var(--mono-font-family);
		background: #e5e7eb;
		padding: 0.1em 0.3em;
		border-radius: 0.2em;
	}
</style>
