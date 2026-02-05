<script lang="ts">
	import type { Snippet } from "svelte";
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
		getViewerKeyAction,
	} from "./viewer/index.js";

	export function focus() {
		if (viewerContainer) viewerContainer.focus();
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
		onCopy,
		onDownload,
		onToggleRaw,
		onToggleHelp,
		compact = false,
		disabled = false,
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
		onCopy: () => void;
		onDownload: () => void;
		onToggleRaw?: () => void;
		onToggleHelp?: () => void;
		compact?: boolean;
		disabled?: boolean;
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

	function handleKeyDown(event: KeyboardEvent) {
		const action = getViewerKeyAction(
			event,
			document.activeElement === viewerContainer,
		);
		if (!action) return;

		let handled = true;
		switch (action.type) {
			case "zoom-in":
				if (!disabled) zoomIn();
				else handled = false;
				break;
			case "zoom-out":
				if (!disabled) zoomOut();
				else handled = false;
				break;
			case "reset-view":
				if (!disabled) resetView();
				else handled = false;
				break;
			case "cycle-background":
				if (!disabled) cycleBackgroundStyle();
				else handled = false;
				break;
			case "copy":
				onCopy();
				break;
			case "download":
				onDownload();
				break;
			case "toggle-raw":
				if (kind === "svg" && onToggleRaw) onToggleRaw();
				else handled = false;
				break;
			case "toggle-help":
				if (kind === "svg" && onToggleHelp) onToggleHelp();
				else handled = false;
				break;
			case "pan":
				if (!disabled) {
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

<ToastContainer {toasts} onRemove={removeToast} />

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
</style>
