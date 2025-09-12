<script lang="ts">
	import { flip } from "svelte/animate";
	import { quintInOut, quintOut } from "svelte/easing";
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";

	// Expose focus method for parent components
	export function focus() {
		if (svgContainer) svgContainer.focus();
	}

	let {
		svg,
		controlsVisible = true,
		editorPath = null,
		scale = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		showRawSvg = $bindable(false),
		showInstructions = $bindable(false),
	}: {
		svg: string;
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
	let transitionDuration = $state(0); // seconds
	let svgContainer: HTMLElement | null = $state(null);
	let lastTouchDistance = $state(0);
	let toasts: { id: number; message: string; type: string }[] = $state([]);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let svgConstrainedWidth: number | null = $state(null);
	let svgConstrainedHeight: number | null = $state(null);

	const SVG_PADDING = 8; // px

	// Parse SVG viewBox to get native dimensions and aspect ratio
	const svgDimensions = $derived.by(() => {
		const viewBoxMatch = svg.match(/viewBox="([^"]*)"/);
		if (!viewBoxMatch) return null;

		const viewBoxValues = viewBoxMatch[1].trim().split(/\s+/g).map(Number);
		if (viewBoxValues.length !== 4) return null;

		const [x, y, width, height] = viewBoxValues;
		return { x, y, width, height, aspectRatio: width / height };
	});

	$effect(() => {
		const containerAspectRatio = containerWidth / containerHeight;

		if (
			!svgDimensions ||
			containerAspectRatio === 0 ||
			!isFinite(containerAspectRatio) ||
			isNaN(containerAspectRatio)
		) {
			svgConstrainedWidth = containerWidth;
			svgConstrainedHeight = containerHeight;
			return;
		}

		if (containerAspectRatio < svgDimensions.aspectRatio) {
			// container is narrower than SVG (relatively speaking)
			svgConstrainedWidth = containerWidth - SVG_PADDING;
			svgConstrainedHeight =
				containerWidth / svgDimensions.aspectRatio - SVG_PADDING;
		} else {
			// container is wider than SVG (relatively speaking)
			svgConstrainedWidth =
				containerHeight * svgDimensions.aspectRatio - SVG_PADDING;
			svgConstrainedHeight = containerHeight - SVG_PADDING;
		}
	});

	function toggleRawSvg() {
		showRawSvg = !showRawSvg;
	}

	function toggleInstructions() {
		showInstructions = !showInstructions;
	}

	function showToast(message: string, type = "success") {
		const id = Date.now();
		const toast = { id, message, type };
		toasts = [...toasts, toast];

		// Auto-remove after 3 seconds
		setTimeout(() => removeToast(id), 3000);
	}

	// TODO: make toast animate from its y position, not from the top
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
		setTimeout(() => {
			transitionDuration = 0;
		}, duration * 1000);
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
		withTransition(() => (scale = Math.min(scale * 1.2, 5)));
	}

	function zoomOut() {
		withTransition(() => (scale = Math.max(scale / 1.2, 0.1)));
	}

	function getTouchDistance(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const touch1 = touches[0];
		const touch2 = touches[1];
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(event: TouchEvent) {
		if (event.touches.length === 2) {
			event.preventDefault();
			event.stopPropagation();
			lastTouchDistance = getTouchDistance(event.touches);
		} else if (event.touches.length === 1) {
			// Single touch for panning - prevent page scroll
			event.preventDefault();
			event.stopPropagation();
			isDragging = true;
			lastMouseX = event.touches[0].clientX;
			lastMouseY = event.touches[0].clientY;
			if (svgContainer) svgContainer.style.cursor = "grabbing";
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (event.touches.length === 2) {
			// Pinch to zoom
			event.preventDefault();
			event.stopPropagation();
			const currentDistance = getTouchDistance(event.touches);
			if (lastTouchDistance > 0) {
				const delta = currentDistance / lastTouchDistance;
				scale = Math.max(0.1, Math.min(5, scale * delta));
			}
			lastTouchDistance = currentDistance;
		} else if (event.touches.length === 1 && isDragging) {
			// Single touch panning
			event.preventDefault();
			event.stopPropagation();
			const deltaX = event.touches[0].clientX - lastMouseX;
			const deltaY = event.touches[0].clientY - lastMouseY;

			panX += deltaX;
			panY += deltaY;

			lastMouseX = event.touches[0].clientX;
			lastMouseY = event.touches[0].clientY;
		}
	}

	function handleTouchEnd(event: TouchEvent) {
		if (event.touches.length === 0) {
			isDragging = false;
			lastTouchDistance = 0;
			if (svgContainer) svgContainer.style.cursor = "grab";
		} else if (event.touches.length === 1) {
			// Reset touch distance when going from 2 touches to 1
			lastTouchDistance = 0;
		}
	}

	function handleWheel(event: WheelEvent) {
		// Only zoom if Ctrl is held (trackpad pinch) or if it's a Mac and Meta is held
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const delta = event.deltaY > 0 ? 0.9 : 1.1;
			scale = Math.max(0.1, Math.min(5, scale * delta));
		}
		// Otherwise, let the scroll event pass through for normal page scrolling
	}

	function handleMouseDown(event: MouseEvent) {
		isDragging = true;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
		if (svgContainer) svgContainer!.style.cursor = "grabbing";
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;

		const deltaX = event.clientX - lastMouseX;
		const deltaY = event.clientY - lastMouseY;

		panX += deltaX;
		panY += deltaY;

		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	}

	function handleMouseUp() {
		isDragging = false;
		if (svgContainer) svgContainer.style.cursor = "grab";
	}

	function copyToClipboard() {
		navigator.clipboard
			.writeText(svg)
			.then(() => {
				showToast("SVG copied to clipboard.");
			})
			.catch(err => {
				console.error("Failed to copy SVG to clipboard:", err);
				showToast("Failed to copy SVG to clipboard", "error");
			});
	}

	// Custom transition functions for toast animations
	function slideIn(_node: Element, { duration = 300 }) {
		return {
			duration,
			easing: quintOut,
			css: (t: number) => {
				const x = (1 - t) * 100;
				const opacity = t;
				return `transform: translateX(${x}%); opacity: ${opacity};`;
			},
		};
	}

	function slideOut(_node: Element, { duration = 300 }) {
		return {
			duration,
			easing: quintOut,
			css: (t: number) => {
				const x = (1 - t) * 100;
				const opacity = t;
				return `transform: translateX(${x}%); opacity: ${opacity};`;
			},
		};
	}

	function handleRawSvgTouchMove(event: TouchEvent) {
		// Prevent page scrolling when scrolling within raw SVG code view
		event.stopPropagation();
	}

	function handleKeyDown(event: KeyboardEvent) {
		const panAmount = 20;
		let handled = false;

		const active = document.activeElement as HTMLElement | null;
		const isTyping =
			!!active &&
			(active.tagName === "TEXTAREA" ||
				active.tagName === "INPUT" ||
				(active.isContentEditable ?? false));
		const hasSvgFocus = document.activeElement === svgContainer;

		// Global shortcuts (work regardless of focus unless typing in an editor)
		if (!isTyping) {
			switch (event.key) {
				case "+":
				case "=":
					// Only handle if no modifier keys are pressed (allow Cmd/Ctrl+Plus for browser zoom)
					if (
						!showRawSvg &&
						!event.metaKey &&
						!event.ctrlKey &&
						!event.altKey
					) {
						zoomIn();
						handled = true;
					}
					break;
				case "-":
				case "_":
					// Only handle if no modifier keys are pressed (allow Cmd/Ctrl+Minus for browser zoom)
					if (
						!showRawSvg &&
						!event.metaKey &&
						!event.ctrlKey &&
						!event.altKey
					) {
						zoomOut();
						handled = true;
					}
					break;
				case "0":
					if (!showRawSvg) {
						resetView();
						handled = true;
					}
					break;
				case "v":
				case "V":
					toggleRawSvg();
					handled = true;
					break;
				case "c":
				case "C":
					copyToClipboard();
					handled = true;
					break;
				case "s":
				case "S":
					downloadSvg();
					handled = true;
					break;
				case "?":
					// Disable help toggle when text editor is open
					if (!editorPath) {
						toggleInstructions();
						handled = true;
					}
					break;
			}
		}

		// Pan controls: require viewer focus (Shift + arrows)
		if (!handled && hasSvgFocus && !isTyping && event.shiftKey) {
			switch (event.key) {
				case "ArrowUp":
					panY += panAmount;
					handled = true;
					break;
				case "ArrowDown":
					panY -= panAmount;
					handled = true;
					break;
				case "ArrowLeft":
					panX += panAmount;
					handled = true;
					break;
				case "ArrowRight":
					panX -= panAmount;
					handled = true;
					break;
			}
		}

		if (handled) {
			event.preventDefault();
		}
	}
</script>

<svelte:window
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:keydown={handleKeyDown}
/>

<div class="svg-display">
	<!-- Toast notifications -->
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div
				class="toast toast-{toast.type}"
				role="alert"
				in:slideIn={{ duration: 300 }}
				out:slideOut={{ duration: 300 }}
				animate:flip={{ duration: 300, easing: quintInOut }}
			>
				<span>{toast.message}</span>
				<button
					class="toast-close"
					onclick={() => removeToast(toast.id)}
					tabindex="0">✕</button
				>
			</div>
		{/each}
	</div>

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
					action="export"
					title="Download SVG (Keyboard: S)"
					ariaLabel="Download SVG file, keyboard shortcut S key"
					onclick={downloadSvg}
				/>
			</div>
		</Toolbar>
	{/if}

	<!-- Usage Instructions -->
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
								zoom
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
		<!-- TODO: format SVG? -->
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
			class="svg-container"
			bind:this={svgContainer}
			tabindex="0"
			onmousedown={handleMouseDown}
			onwheel={handleWheel}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			style="cursor: grab;"
			aria-label="Interactive SVG viewer"
			aria-describedby="svg-controls-description"
		>
			<div
				class="svg-content-mask"
				style="--content-mask-padding: {SVG_PADDING / 2}px;"
				bind:clientWidth={containerWidth}
				bind:clientHeight={containerHeight}
			>
				<div
					class="svg-content"
					style="
						--pan-x: {panX}px;
						--pan-y: {panY}px;
						--scale: {scale};
						--constrained-width: {svgConstrainedWidth}px;
						--constrained-height: {svgConstrainedHeight}px;
						--transition-duration: {transitionDuration}s;
					"
					role="img"
					aria-label="SVG content"
				>
					<!-- can this be used maliciously? any way for untrusted input to get in there? -->
					{@html svg}
				</div>
			</div>
		</button>

		<!-- Hidden description for screen readers -->
		<div id="svg-controls-description" class="sr-only">
			Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset
			view (work globally), Shift+arrow keys to pan (when viewer is focused),
			V to toggle code view, C to copy, S to save. Mouse controls: Drag to
			pan, Ctrl+scroll or Cmd+scroll to zoom. Touch controls: Single finger
			to pan, pinch to zoom.
		</div>
	{/if}
</div>

<style>
	.svg-display {
		--focus-indicator-thickness: 2px;

		/* Border and radius are provided by the RightPane container */
		border: none;
		border-radius: 0;
		overflow: hidden;
		background: white;
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.toast-container {
		position: absolute;
		top: 4.5em;
		right: 1em;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5em;
		pointer-events: none;
	}

	.toast {
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375em;
		padding: 0.75em 1em;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75em;
		max-width: 300px;
		width: fit-content;
		font-size: 0.875em;
		pointer-events: auto;
	}

	.toast-success {
		border-color: #10b981;
		background: #ecfdf5;
		color: #065f46;
	}

	.toast-error {
		border-color: #ef4444;
		background: #fef2f2;
		color: #991b1b;
	}

	.toast-close {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.2em;
		line-height: 1;
		padding: 0;
		margin: 0;
		color: inherit;
		opacity: 0.6;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.toast-close:hover {
		opacity: 1;
	}

	.zoom-level {
		font-family: monospace;
		font-size: 0.875em;
		color: #6b7280;
		min-width: 3em;
		text-align: center;
	}

	.svg-container {
		overflow: hidden;
		position: relative;
		background: radial-gradient(circle, #e5e7eb 1px, transparent 1px);
		background-size: 20px 20px;
		background-position:
			0 0,
			10px 10px;
		border: none;
		padding: 0;
		width: 100%;
		height: 100%;
		flex: 1;
		font-family: inherit;
		display: flex;
		justify-content: center;
		align-items: center;
		touch-action: none; /* Prevent iOS Safari from scrolling */
	}

	.svg-container:focus {
		outline: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.svg-content-mask {
		position: relative;
		place-self: center;
		width: calc(100% - var(--content-mask-padding));
		height: calc(100% - var(--content-mask-padding));
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.svg-container:focus .svg-content-mask {
		box-sizing: content-box;
		border: var(--focus-indicator-thickness) solid #2563eb;
		/* Match inner SVG rounding to avoid clipped corners when docked/minimized */
		border-radius: 7px;
	}

	.svg-content {
		position: absolute;
		width: var(--constrained-width);
		height: var(--constrained-height);
	}

	.svg-content :global(svg) {
		max-width: 100%;
		max-height: 100%;
		box-shadow: 0 2px 10px -1px rgba(0, 0, 0, 0.15);
		border-radius: 6px;
		background: white;
		will-change: transform;
		image-rendering: crisp-edges;
		transform: translate(calc(var(--pan-x)), calc(var(--pan-y)))
			scale(var(--scale));
		transform-origin: center;
		transition: transform var(--transition-duration) ease-out;
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

	.ui-icon {
		height: 20px;
		background-color: #374151;
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

	.instructions-note {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 0.5em;
		padding: 0.75em 1em;
		margin: 0;
		font-size: 0.9em;
		line-height: 1.4;
		color: #1e40af;
	}
</style>
