<script lang="ts">
	export let svg: string;

	let showRawSvg = false;
	let scale = 1;
	let panX = 0;
	let panY = 0;
	let isDragging = false;
	let lastMouseX = 0;
	let lastMouseY = 0;
	let svgContainer: HTMLElement;
	let lastTouchDistance = 0;
	let toasts: { id: number; message: string; type: string }[] = [];

	function toggleRawSvg() {
		showRawSvg = !showRawSvg;
	}

	function showToast(message: string, type = "success") {
		const id = Date.now();
		const toast = { id, message, type };
		toasts = [...toasts, toast];

		// Auto-remove after 3 seconds
		setTimeout(() => {
			toasts = toasts.filter(t => t.id !== id);
		}, 3000);
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
		showToast("SVG downloaded successfully!");
	}

	function resetView() {
		scale = 1;
		panX = 0;
		panY = 0;
	}

	function zoomIn() {
		scale = Math.min(scale * 1.2, 5);
	}

	function zoomOut() {
		scale = Math.max(scale / 1.2, 0.1);
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
			lastTouchDistance = getTouchDistance(event.touches);
		} else if (event.touches.length === 1) {
			// Single touch for panning
			isDragging = true;
			lastMouseX = event.touches[0].clientX;
			lastMouseY = event.touches[0].clientY;
			svgContainer.style.cursor = "grabbing";
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (event.touches.length === 2) {
			// Pinch to zoom
			event.preventDefault();
			const currentDistance = getTouchDistance(event.touches);
			if (lastTouchDistance > 0) {
				const delta = currentDistance / lastTouchDistance;
				scale = Math.max(0.1, Math.min(5, scale * delta));
			}
			lastTouchDistance = currentDistance;
		} else if (event.touches.length === 1 && isDragging) {
			// Single touch panning
			event.preventDefault();
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
			if (svgContainer) {
				svgContainer.style.cursor = "grab";
			}
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
		svgContainer.style.cursor = "grabbing";
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
		if (svgContainer) {
			svgContainer.style.cursor = "grab";
		}
	}

	function copyToClipboard() {
		navigator.clipboard
			.writeText(svg)
			.then(() => {
				showToast("SVG copied to clipboard!");
			})
			.catch(err => {
				console.error("Failed to copy SVG to clipboard:", err);
				showToast("Failed to copy SVG to clipboard", "error");
			});
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Only handle if the svg container has focus
		if (document.activeElement !== svgContainer) return;

		const panAmount = 20;
		let handled = false;

		switch (event.key) {
			case "+":
			case "=":
				zoomIn();
				handled = true;
				break;
			case "-":
			case "_":
				zoomOut();
				handled = true;
				break;
			case "0":
				resetView();
				handled = true;
				break;
			case " ":
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
			case "ArrowUp":
				if (event.shiftKey) {
					panY -= panAmount;
					handled = true;
				}
				break;
			case "ArrowDown":
				if (event.shiftKey) {
					panY += panAmount;
					handled = true;
				}
				break;
			case "ArrowLeft":
				if (event.shiftKey) {
					panX -= panAmount;
					handled = true;
				}
				break;
			case "ArrowRight":
				if (event.shiftKey) {
					panX += panAmount;
					handled = true;
				}
				break;
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
			<div class="toast toast-{toast.type}" role="alert">
				<span>{toast.message}</span>
				<button class="toast-close" onclick={() => removeToast(toast.id)}
					>&times;</button
				>
			</div>
		{/each}
	</div>

	<div class="controls">
		<div class="control-group">
			<button
				onclick={zoomIn}
				title="Zoom In (Keyboard: +)"
				aria-label="Zoom in, keyboard shortcut plus key">🔍+</button
			>
			<button
				onclick={zoomOut}
				title="Zoom Out (Keyboard: -)"
				aria-label="Zoom out, keyboard shortcut minus key">🔍−</button
			>
			<button
				onclick={resetView}
				title="Reset View (Keyboard: 0)"
				aria-label="Reset view, keyboard shortcut zero key">🎯</button
			>
			<span class="zoom-level">{Math.round(scale * 100)}%</span>
		</div>

		<div class="control-group">
			<button
				onclick={toggleRawSvg}
				class:active={showRawSvg}
				title="Toggle Code View (Keyboard: Space)"
				aria-label="Toggle between preview and code view, keyboard shortcut spacebar"
			>
				{showRawSvg ? "Show Preview" : "Show SVG Code"}
			</button>
			<button
				onclick={copyToClipboard}
				title="Copy SVG to Clipboard (Keyboard: C)"
				aria-label="Copy SVG to clipboard, keyboard shortcut C key"
				>📋</button
			>
			<button
				onclick={downloadSvg}
				title="Download SVG (Keyboard: S)"
				aria-label="Download SVG file, keyboard shortcut S key">💾</button
			>
		</div>
	</div>

	{#if showRawSvg}
		<div class="raw-svg">
			<pre><code>{svg}</code></pre>
		</div>
	{:else}
		<button
			class="svg-container"
			bind:this={svgContainer}
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
				class="svg-content"
				style="transform: translate({panX}px, {panY}px) scale({scale});"
			>
				<!-- can this be used maliciously? any way for untrusted input to get in there? -->
				{@html svg}
			</div>
		</button>

		<!-- Hidden description for screen readers -->
		<div id="svg-controls-description" class="sr-only">
			Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset
			view, Shift+arrow keys to pan, Space to toggle code view, C to copy, S
			to save. Mouse controls: Drag to pan, Ctrl+scroll or Cmd+scroll to
			zoom. Touch controls: Single finger to pan, pinch to zoom.
		</div>
	{/if}
</div>

<style>
	.svg-display {
		border: 1px solid #e5e7eb;
		border-radius: 0.5em;
		overflow: hidden;
		background: white;
		position: relative;
		width: 80%;
		margin: 0 auto;
	}

	.toast-container {
		position: absolute;
		top: 1em;
		right: 1em;
		z-index: 1000;
		display: flex;
		flex-direction: column;
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
		min-width: 200px;
		max-width: 300px;
		font-size: 0.875em;
		pointer-events: auto;
		animation: toast-slide-in 0.3s ease-out;
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

	@keyframes toast-slide-in {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1em;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		flex-wrap: wrap;
		gap: 1em;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.controls button {
		background: #ffffff;
		border: 1px solid #d1d5db;
		padding: 0.5em 0.75em;
		border-radius: 0.375em;
		cursor: pointer;
		font-size: 0.875em;
		transition: all 0.2s;
	}

	.controls button:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.controls button:focus {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
		background: #f3f4f6;
		border-color: #2563eb;
	}

	.controls button.active {
		background: #2563eb;
		border-color: #2563eb;
		color: white;
	}

	.controls button.active:focus {
		outline: 2px solid #1d4ed8;
		outline-offset: 2px;
		background: #1d4ed8;
		border-color: #1d4ed8;
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
		font-family: inherit;
	}

	.svg-container:focus {
		outline: none;
		box-shadow: 0 0 0 2px #2563eb;
		margin: 2px;
		width: calc(100% - 4px);
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

	.svg-content {
		transform-origin: center;
		transition: transform 0.1s ease-out;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2em;
	}

	.svg-content :global(svg) {
		max-width: 100%;
		height: auto;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		border-radius: 0.25em;
		background: white;
	}

	.raw-svg {
		max-height: 500px;
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

	@media (max-width: 640px) {
		.controls {
			flex-direction: column;
			align-items: stretch;
		}

		.control-group {
			justify-content: center;
		}
	}
</style>
