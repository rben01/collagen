<script lang="ts">
	import { untrack, type Snippet } from "svelte";
	import ToastContainer, { type Toast } from "./ToastContainer.svelte";
	import {
		BACKGROUND_STYLES,
		CONTENT_PADDING,
		PAN_AMOUNT,
		calculateConstrainedDimensions,
		calculateZoomToPoint,
		clampScale,
		getTouchDistance,
		getTouchMidpoint,
	} from "./viewer/index.js";

	export function focus() {
		if (viewerContainer) viewerContainer.focus();
	}

	export function hasFocus() {
		return document.activeElement === viewerContainer;
	}

	export function zoomIn() {
		withTransition(() => (scale = clampScale(scale * 1.2)));
	}

	export function zoomOut() {
		withTransition(() => (scale = clampScale(scale / 1.2)));
	}

	export function resetView() {
		withTransition(() => {
			scale = 1;
			panX = 0;
			panY = 0;
		});
	}

	export function cycleBackgroundStyle() {
		backgroundStyleIndex =
			(backgroundStyleIndex + 1) % BACKGROUND_STYLES.length;
	}

	export function pan(direction: "up" | "down" | "left" | "right") {
		switch (direction) {
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
	}

	export function showToast(message: string, type = "success") {
		const id = toastCounter++;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => removeToast(id), 3000);
	}

	let {
		kind,
		contentWidth,
		contentHeight,
		scale = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		backgroundStyleIndex = $bindable(1),
		showInstructions = $bindable(false),
		compact = false,
		ariaLabel = "Interactive viewer",
		children,
	}: {
		kind: "svg" | "image";
		contentWidth: number;
		contentHeight: number;
		scale?: number;
		panX?: number;
		panY?: number;
		backgroundStyleIndex?: number;
		showInstructions?: boolean;
		compact?: boolean;
		ariaLabel?: string;
		children: Snippet<
			[{ constrainedDimensions: { width: number; height: number } }]
		>;
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
	let prevContainerDimensions = $state<{
		width: number;
		height: number;
	} | null>(null);

	let currentBackgroundStyle = $derived(
		BACKGROUND_STYLES[backgroundStyleIndex],
	);

	const constrainedDimensions = $derived(
		calculateConstrainedDimensions(
			contentWidth,
			contentHeight,
			containerWidth,
			containerHeight,
			CONTENT_PADDING,
		),
	);

	// Adjust pan values when container dimensions change to preserve the same visible position
	$effect(() => {
		const currentWidth = containerWidth;
		const currentHeight = containerHeight;
		const prev = untrack(() => prevContainerDimensions);

		if (
			prev &&
			currentWidth > 0 &&
			currentHeight > 0 &&
			(prev.width !== currentWidth || prev.height !== currentHeight)
		) {
			// Container dimensions changed - adjust pan to preserve the same relative position
			const widthRatio = currentWidth / prev.width;
			const heightRatio = currentHeight / prev.height;

			panX = panX / widthRatio;
			panY = panY / heightRatio;
		}

		if (currentWidth > 0 && currentHeight > 0) {
			prevContainerDimensions = {
				width: currentWidth,
				height: currentHeight,
			};
		}
	});

	function removeToast(id: number) {
		toasts = toasts.filter(t => t.id !== id);
	}

	function withTransition(fn: () => void, duration = 0.1) {
		transitionDuration = duration;
		setTimeout(() => (transitionDuration = 0), duration * 1000);
		fn();
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
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<ToastContainer {toasts} onRemove={removeToast} />

{#if showInstructions}
	<div class="instructions" role="region" aria-label="Usage instructions">
		<div class="instructions-content">
			<h4>How to Use the {kind === "svg" ? "SVG" : "Image"} Viewer</h4>

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
							<strong>Focus</strong> the {kind === "svg"
								? "SVG"
								: "image"} viewer to enable panning
						</li>
						<li><strong>B</strong> key: Change background style</li>
						<li><strong>?</strong> key: Toggle help instructions</li>
						{#if kind === "svg"}
							<li><strong>V</strong> key: Toggle code view</li>
						{/if}
						<li>
							<strong>C</strong> key: Copy {kind === "svg"
								? "SVG"
								: "image"} to clipboard
						</li>
						<li>
							<strong>S</strong> key: Download {kind === "svg"
								? "SVG"
								: "image"} file
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
{/if}

<button
	class="viewer-container bg-{currentBackgroundStyle.id}"
	class:compact
	class:dragging={isDragging}
	bind:this={viewerContainer}
	tabindex="0"
	onmousedown={handleMouseDown}
	onwheel={handleWheel}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	style="cursor: {isDragging ? 'grabbing' : 'grab'};"
	aria-label={ariaLabel}
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
			aria-label="Viewer content"
		>
			<div class="viewer-media">
				<div class="viewer-interaction-overlay"></div>
				{@render children({ constrainedDimensions })}
			</div>
		</div>
	</div>
</button>

<div id="viewer-controls-description" class="sr-only">
	Keyboard controls: Press + or = to zoom in, - to zoom out, 0 to reset view
	(work globally), B to change background style, Shift+arrow keys to pan (when
	viewer is focused), C to copy, S to save. Mouse controls: Drag to pan,
	Ctrl+scroll or Cmd+scroll to zoom (Safari users: pinch to zoom). Touch
	controls: Single finger to pan, pinch to zoom.
</div>

<style>
	@import "./viewer/viewer.css";

	.compact:focus .viewer-content-mask {
		border-radius: 7px;
	}

	.viewer-media {
		overflow: hidden;
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
