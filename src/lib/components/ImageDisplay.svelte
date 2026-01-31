<script lang="ts">
	import { flip } from "svelte/animate";
	import { quintInOut } from "svelte/easing";
	import { fly } from "svelte/transition";
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";
	import {
		base64Encode,
		getMimeType,
		type InMemoryFileSystem,
	} from "$lib/collagen-ts/index.js";

	let {
		filesystem,
		imagePath,
		scale = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		handleCloseImage,
	}: {
		filesystem: InMemoryFileSystem;
		imagePath: string;
		scale?: number;
		panX?: number;
		panY?: number;
		handleCloseImage: () => void;
	} = $props();

	let isDragging = $state(false);
	let lastMouseX = $state(0);
	let lastMouseY = $state(0);
	let transitionDuration = $state(0); // seconds
	let imageContainer: HTMLElement | null = $state(null);
	let lastTouchDistance = $state(0);
	let toastCounter = $state(0);
	let toasts: { id: number; message: string; type: string }[] = $state([]);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let imageConstrainedWidth: number | null = $state(null);
	let imageConstrainedHeight: number | null = $state(null);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	// Background style management
	const backgroundStyles = [
		{ id: "solid-light", name: "Solid Light" },
		{ id: "light-checkerboard", name: "Light Checkerboard" },
		{ id: "dark-checkerboard", name: "Dark Checkerboard" },
		{ id: "solid-dark", name: "Solid Dark" },
	] as const;
	let currentBackgroundStyleIndex = $state(1); // initial style is light checkerboard
	let currentBackgroundStyle = $derived(
		backgroundStyles[currentBackgroundStyleIndex],
	);

	const IMAGE_PADDING = 8; // px
	const MIN_SCALE = 0.1;
	const MAX_SCALE = 5;

	// Load image and create data URI
	const imageDataUri = $derived.by(() => {
		try {
			const file = filesystem.load(imagePath);
			const mimeType = getMimeType(imagePath);
			const base64 = base64Encode(file.bytes);
			return `data:${mimeType};base64,${base64}`;
		} catch {
			return null;
		}
	});

	// Calculate constrained dimensions based on natural image size and container
	$effect(() => {
		if (
			!naturalWidth ||
			!naturalHeight ||
			!containerWidth ||
			!containerHeight
		) {
			imageConstrainedWidth = containerWidth;
			imageConstrainedHeight = containerHeight;
			return;
		}

		const imageAspectRatio = naturalWidth / naturalHeight;
		const containerAspectRatio = containerWidth / containerHeight;

		if (
			containerAspectRatio === 0 ||
			!isFinite(containerAspectRatio) ||
			isNaN(containerAspectRatio)
		) {
			imageConstrainedWidth = containerWidth;
			imageConstrainedHeight = containerHeight;
			return;
		}

		if (containerAspectRatio < imageAspectRatio) {
			// container is narrower than image (relatively speaking)
			imageConstrainedWidth = containerWidth - IMAGE_PADDING;
			imageConstrainedHeight =
				containerWidth / imageAspectRatio - IMAGE_PADDING;
		} else {
			// container is wider than image (relatively speaking)
			imageConstrainedWidth =
				containerHeight * imageAspectRatio - IMAGE_PADDING;
			imageConstrainedHeight = containerHeight - IMAGE_PADDING;
		}
	});

	function showToast(message: string, type = "success") {
		const id = toastCounter;
		const toast = { id, message, type };
		toastCounter += 1;
		toasts = [...toasts, toast];

		// Auto-remove after 3 seconds
		setTimeout(() => removeToast(id), 3000);
	}

	function removeToast(id: number) {
		toasts = toasts.filter(t => t.id !== id);
	}

	function downloadImage() {
		if (!imageDataUri) return;
		const a = document.createElement("a");
		a.href = imageDataUri;
		// Extract filename from path
		const filename = imagePath.includes("/")
			? imagePath.slice(imagePath.lastIndexOf("/") + 1)
			: imagePath;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		showToast("Image downloaded.");
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
		withTransition(() => (scale = Math.min(scale * 1.2, MAX_SCALE)));
	}

	function zoomOut() {
		withTransition(() => (scale = Math.max(scale / 1.2, MIN_SCALE)));
	}

	function cycleBackgroundStyle() {
		currentBackgroundStyleIndex =
			(currentBackgroundStyleIndex + 1) % backgroundStyles.length;
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

				// Calculate midpoint between the two touches
				const touch1 = event.touches[0];
				const touch2 = event.touches[1];
				const midpointX = (touch1.clientX + touch2.clientX) / 2;
				const midpointY = (touch1.clientY + touch2.clientY) / 2;

				zoomToPoint(midpointX, midpointY, delta);
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
		} else if (event.touches.length === 1) {
			// Reset touch distance when going from 2 touches to 1
			lastTouchDistance = 0;
		}
	}

	function zoomToPoint(clientX: number, clientY: number, scaleDelta: number) {
		if (!imageContainer) return;

		// Get the container bounds
		const containerRect = imageContainer.getBoundingClientRect();

		// Calculate cursor position relative to container center
		const cursorX = clientX - containerRect.left - containerRect.width / 2;
		const cursorY = clientY - containerRect.top - containerRect.height / 2;

		// Calculate cursor position in image coordinate space (before zoom)
		const cursorImageX = (cursorX - panX) / scale;
		const cursorImageY = (cursorY - panY) / scale;

		// clamp scale to scale bounds
		const newScale = Math.max(
			MIN_SCALE,
			Math.min(scale * scaleDelta, MAX_SCALE),
		);

		// Adjust pan so cursor point remains stationary
		panX = cursorX - cursorImageX * newScale;
		panY = cursorY - cursorImageY * newScale;

		scale = newScale;
	}

	function handleWheel(event: WheelEvent) {
		// Only zoom if Ctrl is held (trackpad pinch) or if it's a Mac and Meta is held
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const delta = event.deltaY > 0 ? 0.9 : 1.1;
			zoomToPoint(event.clientX, event.clientY, delta);
		}
		// Otherwise, let the scroll event pass through for normal page scrolling
	}

	function handleMouseDown(event: MouseEvent) {
		isDragging = true;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
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
	}

	async function copyToClipboard() {
		if (!imageDataUri) return;

		try {
			// Fetch the data URI as a blob
			const response = await fetch(imageDataUri);
			const blob = await response.blob();

			// Use the Clipboard API to copy the image
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			]);
			showToast("Image copied to clipboard.");
		} catch (err) {
			console.error("Failed to copy image to clipboard:", err);
			showToast("Failed to copy image to clipboard", "error");
		}
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
		const hasImageFocus = document.activeElement === imageContainer;

		// Global shortcuts (work regardless of focus unless typing in an editor)
		if (!isTyping) {
			switch (event.key) {
				case "+":
				case "=":
					// Only handle if no modifier keys are pressed (allow Cmd/Ctrl+Plus for browser zoom)
					if (!event.metaKey && !event.ctrlKey && !event.altKey) {
						zoomIn();
						handled = true;
					}
					break;
				case "-":
				case "_":
					// Only handle if no modifier keys are pressed (allow Cmd/Ctrl+Minus for browser zoom)
					if (!event.metaKey && !event.ctrlKey && !event.altKey) {
						zoomOut();
						handled = true;
					}
					break;
				case "0":
					resetView();
					handled = true;
					break;
				case "b":
				case "B":
					cycleBackgroundStyle();
					handled = true;
					break;
				case "c":
				case "C":
					copyToClipboard();
					handled = true;
					break;
				case "s":
				case "S":
					downloadImage();
					handled = true;
					break;
			}
		}

		// Pan controls: require viewer focus (Shift + arrows)
		if (!handled && hasImageFocus && !isTyping && event.shiftKey) {
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

	function handleImageLoad(event: Event) {
		const img = event.target as HTMLImageElement;
		naturalWidth = img.naturalWidth;
		naturalHeight = img.naturalHeight;
	}
</script>

<svelte:window
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:keydown={handleKeyDown}
/>

<div class="image-display">
	<!-- Toast notifications -->
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div
				class="toast toast-{toast.type}"
				role="alert"
				transition:fly={{ duration: 300, x: "100%" }}
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

	<Toolbar ariaLabel="Image viewer controls">
		<div class="control-group">
			<ControlButton
				action="zoom-in"
				title="Zoom In (Keyboard: +)"
				ariaLabel="Zoom in, keyboard shortcut plus key"
				onclick={zoomIn}
			/>
			<ControlButton
				action="zoom-out"
				title="Zoom Out (Keyboard: -)"
				ariaLabel="Zoom out, keyboard shortcut minus key"
				onclick={zoomOut}
			/>
			<ControlButton
				action="reset-view"
				title="Reset View (Keyboard: 0)"
				ariaLabel="Reset view, keyboard shortcut zero key"
				onclick={resetView}
			/>
			<span class="zoom-level">{Math.round(scale * 100)}%</span>
		</div>

		<div class="file-label" title={imagePath}>{imagePath}</div>

		<div class="control-group">
			<ControlButton
				action="background"
				title="Change Background (Keyboard: B)"
				ariaLabel="Change background style from {currentBackgroundStyle.name} to {backgroundStyles[
					(currentBackgroundStyleIndex + 1) % backgroundStyles.length
				].name}, keyboard shortcut B key"
				onclick={cycleBackgroundStyle}
			/>
			<ControlButton
				action="copy"
				title="Copy Image to Clipboard (Keyboard: C)"
				ariaLabel="Copy image to clipboard, keyboard shortcut C key"
				onclick={copyToClipboard}
			/>
			<ControlButton
				action="export-image"
				title="Download Image (Keyboard: S)"
				ariaLabel="Download image file, keyboard shortcut S key"
				onclick={downloadImage}
			/>
			<ControlButton
				action="minimize-editor"
				ariaLabel="Close image viewer"
				title="Close image viewer"
				onclick={handleCloseImage}
			/>
		</div>
	</Toolbar>

	{#if imageDataUri}
		<button
			class="image-container bg-{currentBackgroundStyle.id}"
			class:dragging={isDragging}
			bind:this={imageContainer}
			tabindex="0"
			onmousedown={handleMouseDown}
			onwheel={handleWheel}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			style="cursor: {isDragging ? 'grabbing' : 'grab'};"
			aria-label="Interactive image viewer"
			aria-describedby="image-controls-description"
		>
			<div
				class="image-content-mask"
				style:--content-mask-padding="{IMAGE_PADDING / 2}px;"
				bind:clientWidth={containerWidth}
				bind:clientHeight={containerHeight}
			>
				<div
					class="image-content"
					style:--pan-x="{panX}px"
					style:--pan-y="{panY}px"
					style:--scale={scale}
					style:--constrained-width="{imageConstrainedWidth}px"
					style:--constrained-height="{imageConstrainedHeight}px"
					style:--transition-duration="{transitionDuration}s"
					role="img"
					aria-label="Image content"
				>
					<img
						src={imageDataUri}
						alt={imagePath}
						width={imageConstrainedWidth}
						height={imageConstrainedHeight}
						onload={handleImageLoad}
					/>
				</div>
			</div>
		</button>

		<!-- Hidden description for screen readers -->
		<div id="image-controls-description" class="sr-only">
			Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset
			view (work globally), B to change background style, Shift+arrow keys to
			pan (when viewer is focused), C to copy, S to save. Mouse controls:
			Drag to pan, Ctrl+scroll or Cmd+scroll to zoom. Touch controls: Single
			finger to pan, pinch to zoom.
		</div>
	{:else}
		<div class="error-state">
			<p>Failed to load image: {imagePath}</p>
		</div>
	{/if}
</div>

<style>
	.image-display {
		--focus-indicator-thickness: 2px;

		/* Border and radius are provided by the RightPane container */
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

	.file-label {
		font-family: var(--mono-font-family);
		font-size: 0.9em;
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		text-align: center;
		padding: 0 0.5em;
	}

	@property --checkerboard-primary {
		syntax: "<color>";
		initial-value: white;
		inherits: false;
	}

	@property --checkerboard-secondary {
		syntax: "<color>";
		initial-value: white;
		inherits: false;
	}

	.image-container {
		overflow: hidden;
		position: relative;
		background: repeating-conic-gradient(
				var(--checkerboard-primary) 0 25%,
				var(--checkerboard-secondary) 0 50%
			)
			50% / 20px 20px;
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
		transition:
			--checkerboard-primary 0.2s ease,
			--checkerboard-secondary 0.2s ease;
	}

	.image-container.bg-light-checkerboard {
		--checkerboard-primary: #fff;
		--checkerboard-secondary: #ddd;
	}

	.image-container.bg-dark-checkerboard {
		--checkerboard-primary: #292f38;
		--checkerboard-secondary: #1a1e25;
	}

	.image-container.bg-solid-light {
		--checkerboard-primary: #fff;
		--checkerboard-secondary: #fff;
	}

	.image-container.bg-solid-dark {
		--checkerboard-primary: #1a1e25;
		--checkerboard-secondary: #1a1e25;
	}

	.image-container:focus {
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

	.image-content-mask {
		position: relative;
		place-self: center;
		width: calc(100% - var(--content-mask-padding));
		height: calc(100% - var(--content-mask-padding));
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.image-container:focus .image-content-mask {
		box-sizing: content-box;
		border: var(--focus-indicator-thickness) solid #2563eb;
		border-radius: 0 0 7px 7px;
	}

	.image-container.dragging img {
		background: rgba(255, 255, 255, 0.1);
		box-shadow: 0 2px 10px -1px rgba(0, 0, 0, 0.85);
	}

	.image-content {
		position: absolute;
		width: var(--constrained-width);
		height: var(--constrained-height);
	}

	.image-content img {
		max-width: 100%;
		max-height: 100%;
		box-shadow: 0 2px 10px -1px rgba(0, 0, 0, 0.45);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 6px;
		background: transparent;
		will-change: transform;
		transform: translate(calc(var(--pan-x)), calc(var(--pan-y)))
			scale(var(--scale));
		transform-origin: center;
		transition: transform var(--transition-duration) ease-out;
		pointer-events: none;
		object-fit: contain;
	}

	.image-container:is(.bg-dark-checkerboard, .bg-solid-dark)
		.image-content
		img {
		box-shadow: 0 2px 10px -1px rgba(127, 127, 127, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.error-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fef2f2;
		color: #dc2626;
		font-size: 1.1em;
	}
</style>
