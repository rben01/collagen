/**
 * Shared utilities for image and SVG viewer components
 */

// =============================================================================
// Constants
// =============================================================================

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;
export const CONTENT_PADDING = 8; // px
export const PAN_AMOUNT = 20; // px per keyboard pan

export const BACKGROUND_STYLES = [
	{ id: "solid-light", name: "Solid Light" },
	{ id: "light-checkerboard", name: "Light Checkerboard" },
	{ id: "dark-checkerboard", name: "Dark Checkerboard" },
	{ id: "solid-dark", name: "Solid Dark" },
] as const;

export type BackgroundStyleId = (typeof BACKGROUND_STYLES)[number]["id"];

// =============================================================================
// Touch Utilities
// =============================================================================

export function getTouchDistance(touches: TouchList): number {
	if (touches.length < 2) return 0;
	const touch1 = touches[0];
	const touch2 = touches[1];
	const dx = touch1.clientX - touch2.clientX;
	const dy = touch1.clientY - touch2.clientY;
	return Math.sqrt(dx * dx + dy * dy);
}

export function getTouchMidpoint(touches: TouchList): { x: number; y: number } {
	const touch1 = touches[0];
	const touch2 = touches[1];
	return {
		x: (touch1.clientX + touch2.clientX) / 2,
		y: (touch1.clientY + touch2.clientY) / 2,
	};
}

// =============================================================================
// Zoom Utilities
// =============================================================================

export interface ZoomState {
	scale: number;
	panX: number;
	panY: number;
}

export function clampScale(scale: number): number {
	return Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));
}

export function calculateZoomToPoint(
	clientX: number,
	clientY: number,
	scaleDelta: number,
	containerRect: DOMRect,
	currentState: ZoomState,
): ZoomState {
	// Calculate cursor position relative to container center
	const cursorX = clientX - containerRect.left - containerRect.width / 2;
	const cursorY = clientY - containerRect.top - containerRect.height / 2;

	// Calculate cursor position in content coordinate space (before zoom)
	const cursorContentX = (cursorX - currentState.panX) / currentState.scale;
	const cursorContentY = (cursorY - currentState.panY) / currentState.scale;

	// Clamp scale to bounds
	const newScale = clampScale(currentState.scale * scaleDelta);

	// Adjust pan so cursor point remains stationary
	return {
		scale: newScale,
		panX: cursorX - cursorContentX * newScale,
		panY: cursorY - cursorContentY * newScale,
	};
}

// =============================================================================
// Constrained Dimensions
// =============================================================================

export function calculateConstrainedDimensions(
	contentWidth: number,
	contentHeight: number,
	containerWidth: number,
	containerHeight: number,
	padding: number,
): { width: number; height: number } {
	if (!contentWidth || !contentHeight || !containerWidth || !containerHeight) {
		return { width: containerWidth, height: containerHeight };
	}

	const contentAspectRatio = contentWidth / contentHeight;
	const containerAspectRatio = containerWidth / containerHeight;

	if (
		containerAspectRatio === 0 ||
		!isFinite(containerAspectRatio) ||
		isNaN(containerAspectRatio)
	) {
		return { width: containerWidth, height: containerHeight };
	}

	if (containerAspectRatio < contentAspectRatio) {
		// Container is narrower than content (relatively speaking)
		return {
			width: containerWidth - padding,
			height: containerWidth / contentAspectRatio - padding,
		};
	} else {
		// Container is wider than content (relatively speaking)
		return {
			width: containerHeight * contentAspectRatio - padding,
			height: containerHeight - padding,
		};
	}
}

// =============================================================================
// Keyboard Utilities
// =============================================================================

export function isTypingInInput(): boolean {
	const active = document.activeElement as HTMLElement | null;
	return (
		!!active &&
		(active.tagName === "TEXTAREA" ||
			active.tagName === "INPUT" ||
			(active.isContentEditable ?? false))
	);
}
