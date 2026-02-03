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
	let transitionDuration = $state(0);
	let viewerContainer: HTMLElement | null = $state(null);
	let lastTouchDistance = $state(0);
	let toastCounter = $state(0);
	let toasts: Toast[] = $state([]);
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	let currentBackgroundStyleIndex = $state(1);
	let currentBackgroundStyle = $derived(
		BACKGROUND_STYLES[currentBackgroundStyleIndex],
	);

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

	const constrainedDimensions = $derived(
		calculateConstrainedDimensions(
			naturalWidth,
			naturalHeight,
			containerWidth,
			containerHeight,
			CONTENT_PADDING,
		),
	);

	function showToast(message: string, type = "success") {
		const id = toastCounter++;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => removeToast(id), 3000);
	}

	function removeToast(id: number) {
		toasts = toasts.filter(t => t.id !== id);
	}

	function downloadImage() {
		if (!imageDataUri) return;
		const a = document.createElement("a");
		a.href = imageDataUri;
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

	async function copyToClipboard() {
		if (!imageDataUri) return;
		try {
			const response = await fetch(imageDataUri);
			const blob = await response.blob();
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
		const action = getViewerKeyAction(
			event,
			document.activeElement === viewerContainer,
		);
		if (!action) return;

		let handled = true;
		switch (action.type) {
			case "zoom-in":
				zoomIn();
				break;
			case "zoom-out":
				zoomOut();
				break;
			case "reset-view":
				resetView();
				break;
			case "cycle-background":
				cycleBackgroundStyle();
				break;
			case "copy":
				copyToClipboard();
				break;
			case "download":
				downloadImage();
				break;
			case "pan":
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
				break;
			default:
				handled = false;
		}

		if (handled) event.preventDefault();
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

<div class="viewer-display">
	<ToastContainer {toasts} onRemove={removeToast} />

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
				ariaLabel="Change background style from {currentBackgroundStyle.name} to {BACKGROUND_STYLES[
					(currentBackgroundStyleIndex + 1) % BACKGROUND_STYLES.length
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
			aria-label="Interactive image viewer"
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
					aria-label="Image content"
				>
					<img
						class="viewer-media"
						src={imageDataUri}
						alt={imagePath}
						width={constrainedDimensions.width}
						height={constrainedDimensions.height}
						onload={handleImageLoad}
					/>
				</div>
			</div>
		</button>

		<div id="viewer-controls-description" class="sr-only">
			Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset
			view, B to change background style, Shift+arrow keys to pan (when
			viewer is focused), C to copy, S to save. Mouse controls: Drag to pan,
			Ctrl+scroll or Cmd+scroll to zoom (Safari users: pinch to zoom). Touch
			controls: Single finger to pan, pinch to zoom.
		</div>
	{:else}
		<div class="viewer-error">
			<p>Failed to load image: {imagePath}</p>
		</div>
	{/if}
</div>

<style>
	@import "./viewer/viewer.css";

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

	.viewer-media {
		object-fit: contain;
	}
</style>
