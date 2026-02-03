<script lang="ts">
	import ControlButton from "./ControlButton.svelte";
	import ToastContainer, { type Toast } from "./ToastContainer.svelte";
	import Toolbar from "./Toolbar.svelte";
	import {
		BACKGROUND_STYLES,
		CONTENT_PADDING,
		PAN_AMOUNT,
		calculateConstrainedDimensions,
		calculateZoomToPoint,
		clampScale,
		getTouchDistance,
		getTouchMidpoint,
		getViewerKeyAction,
	} from "./viewer/index.js";
	import { base64Encode } from "$lib/collagen-ts";

	export function focus() {
		if (viewerContainer) viewerContainer.focus();
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

	let isDragging = $state(false);
	let lastMouseX = $state(0);
	let lastMouseY = $state(0);
	let transitionDuration = $state(0);
	let viewerContainer: HTMLElement | null = $state(null);
	let lastTouchDistance = $state(0);
	let toastCounter = $state(0);
	let toasts: Toast[] = $state([]);
	let containerWidth = $state(0);
	let containerHeight = $state(0);

	const TEXT_ENCODER = new TextEncoder();

	let currentBackgroundStyleIndex = $state(1);
	let currentBackgroundStyle = $derived(
		BACKGROUND_STYLES[currentBackgroundStyleIndex],
	);

	const svgDimensions = $derived.by(() => {
		const viewBoxMatch = svg.match(/viewBox="([^"]*)"/);
		if (!viewBoxMatch) return null;

		const viewBoxValues = viewBoxMatch[1].trim().split(/\s+/g).map(Number);
		if (viewBoxValues.length !== 4) return null;

		const [x, y, width, height] = viewBoxValues;
		return { x, y, width, height, aspectRatio: width / height };
	});

	const constrainedDimensions = $derived(
		calculateConstrainedDimensions(
			svgDimensions?.width ?? 0,
			svgDimensions?.height ?? 0,
			containerWidth,
			containerHeight,
			CONTENT_PADDING,
		),
	);

	function toggleRawSvg() {
		showRawSvg = !showRawSvg;
	}

	function toggleInstructions() {
		showInstructions = !showInstructions;
	}

	function showToast(message: string, type = "success") {
		const id = toastCounter++;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => removeToast(id), 3000);
	}

	function removeToast(id: number) {
		toasts = toasts.filter(t => t.id !== id);
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
		showToast("SVG downloaded.");
	}

	function withTransition(fn: () => void, duration = 0.1) {
		transitionDuration = duration;
		setTimeout(() => (transitionDuration = 0), duration * 1000);
		fn();
	}

	function resetView() {
		withTransition(() => {
			scale = 1;
			panX = 0;
			panY = 0;
		});
	}

	function zoomIn() {
		withTransition(() => (scale = clampScale(scale * 1.2)));
	}

	function zoomOut() {
		withTransition(() => (scale = clampScale(scale / 1.2)));
	}

	function cycleBackgroundStyle() {
		currentBackgroundStyleIndex =
			(currentBackgroundStyleIndex + 1) % BACKGROUND_STYLES.length;
	}

	function zoomToPoint(clientX: number, clientY: number, scaleDelta: number) {
		if (!viewerContainer) return;
		const result = calculateZoomToPoint(
			clientX,
			clientY,
			scaleDelta,
			viewerContainer.getBoundingClientRect(),
			{ scale, panX, panY },
		);
		scale = result.scale;
		panX = result.panX;
		panY = result.panY;
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length === 2) {
			event.preventDefault();
			event.stopPropagation();
			lastTouchDistance = getTouchDistance(event.touches);
		} else if (event.touches.length === 1) {
			event.preventDefault();
			event.stopPropagation();
			isDragging = true;
			lastMouseX = event.touches[0].clientX;
			lastMouseY = event.touches[0].clientY;
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (event.touches.length === 2) {
			event.preventDefault();
			event.stopPropagation();
			const currentDistance = getTouchDistance(event.touches);
			if (lastTouchDistance > 0) {
				const delta = currentDistance / lastTouchDistance;
				const midpoint = getTouchMidpoint(event.touches);
				zoomToPoint(midpoint.x, midpoint.y, delta);
			}
			lastTouchDistance = currentDistance;
		} else if (event.touches.length === 1 && isDragging) {
			event.preventDefault();
			event.stopPropagation();
			panX += event.touches[0].clientX - lastMouseX;
			panY += event.touches[0].clientY - lastMouseY;
			lastMouseX = event.touches[0].clientX;
			lastMouseY = event.touches[0].clientY;
		}
	}

	function handleTouchEnd(event: TouchEvent) {
		if (event.touches.length === 0) {
			isDragging = false;
			lastTouchDistance = 0;
		} else if (event.touches.length === 1) {
			lastTouchDistance = 0;
		}
	}

	function handleWheel(event: WheelEvent) {
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const delta = event.deltaY > 0 ? 0.9 : 1.1;
			zoomToPoint(event.clientX, event.clientY, delta);
		}
	}

	function handleMouseDown(event: MouseEvent) {
		isDragging = true;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		panX += event.clientX - lastMouseX;
		panY += event.clientY - lastMouseY;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function copyToClipboard() {
		navigator.clipboard
			.writeText(svg)
			.then(() => showToast("SVG copied to clipboard."))
			.catch(err => {
				console.error("Failed to copy SVG to clipboard:", err);
				showToast("Failed to copy SVG to clipboard", "error");
			});
	}

	function handleRawSvgTouchMove(event: TouchEvent) {
		event.stopPropagation();
	}

	function handleKeyDown(event: KeyboardEvent) {
		const action = getViewerKeyAction(
			event,
			document.activeElement === viewerContainer,
		);
		if (!action) return;

		let handled = true;
		switch (action.type) {
			case "zoom-in":
				if (!showRawSvg) zoomIn();
				else handled = false;
				break;
			case "zoom-out":
				if (!showRawSvg) zoomOut();
				else handled = false;
				break;
			case "reset-view":
				if (!showRawSvg) resetView();
				else handled = false;
				break;
			case "cycle-background":
				if (!showRawSvg) cycleBackgroundStyle();
				else handled = false;
				break;
			case "toggle-raw":
				toggleRawSvg();
				break;
			case "copy":
				copyToClipboard();
				break;
			case "download":
				downloadSvg();
				break;
			case "toggle-help":
				if (!editorPath) toggleInstructions();
				else handled = false;
				break;
			case "pan":
				if (!showRawSvg) {
					switch (action.direction) {
						case "up":
							panY += PAN_AMOUNT;
							break;
						case "down":
							panY -= PAN_AMOUNT;
							break;
						case "left":
							panX += PAN_AMOUNT;
							break;
						case "right":
							panX -= PAN_AMOUNT;
							break;
					}
				} else {
					handled = false;
				}
				break;
			default:
				handled = false;
		}

		if (handled) event.preventDefault();
	}
</script>

<svelte:window
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:keydown={handleKeyDown}
/>

<div class="viewer-display" class:compact>
	<ToastContainer {toasts} onRemove={removeToast} />

	{#if controlsVisible}
		<Toolbar ariaLabel="SVG viewer controls">
			<div class="control-group">
				<ControlButton
					action="zoom-in"
					title="Zoom In (Keyboard: +)"
					ariaLabel="Zoom in, keyboard shortcut plus key"
					onclick={zoomIn}
					disabled={showRawSvg}
				/>
				<ControlButton
					action="zoom-out"
					title="Zoom Out (Keyboard: -)"
					ariaLabel="Zoom out, keyboard shortcut minus key"
					onclick={zoomOut}
					disabled={showRawSvg}
				/>
				<ControlButton
					action="reset-view"
					title="Reset View (Keyboard: 0)"
					ariaLabel="Reset view, keyboard shortcut zero key"
					onclick={resetView}
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
					ariaLabel="Change background style from {currentBackgroundStyle.name} to {BACKGROUND_STYLES[
						(currentBackgroundStyleIndex + 1) % BACKGROUND_STYLES.length
					].name}, keyboard shortcut B key"
					onclick={cycleBackgroundStyle}
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
		<button
			class="viewer-container bg-{currentBackgroundStyle.id}"
			class:dragging={isDragging}
			bind:this={viewerContainer}
			tabindex="0"
			onmousedown={handleMouseDown}
			onwheel={handleWheel}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			style="cursor: {isDragging ? 'grabbing' : 'grab'};"
			aria-label="Interactive SVG viewer"
			aria-describedby="viewer-controls-description"
		>
			<div
				class="viewer-content-mask"
				style:--content-mask-padding="{CONTENT_PADDING / 2}px"
				bind:clientWidth={containerWidth}
				bind:clientHeight={containerHeight}
			>
				<div
					class="viewer-content"
					style:--pan-x="{panX}px"
					style:--pan-y="{panY}px"
					style:--scale={scale}
					style:--constrained-width="{constrainedDimensions.width}px"
					style:--constrained-height="{constrainedDimensions.height}px"
					style:--transition-duration="{transitionDuration}s"
					role="img"
					aria-label="SVG content"
				>
					<iframe
						class="viewer-media"
						title="Generated SVG"
						width={constrainedDimensions.width}
						height={constrainedDimensions.height}
						style="border:none;"
						src="data:image/svg+xml;base64,{base64Encode(
							TEXT_ENCODER.encode(svg),
						)}"
					></iframe>
				</div>
			</div>
		</button>

		<div id="viewer-controls-description" class="sr-only">
			Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset
			view (work globally), B to change background style, Shift+arrow keys to
			pan (when viewer is focused), V to toggle code view, C to copy, S to
			save. Mouse controls: Drag to pan, Ctrl+scroll or Cmd+scroll to zoom
			(Safari users: pinch to zoom). Touch controls: Single finger to pan,
			pinch to zoom.
		</div>
	{/if}
</div>

<style>
	@import "./viewer/viewer.css";

	.compact .viewer-container:focus .viewer-content-mask {
		border-radius: 7px;
	}

	.viewer-media {
		image-rendering: crisp-edges;
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
