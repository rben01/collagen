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
	contentWidth: number | null,
	contentHeight: number | null,
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

/**
 * Check if any modifier keys are pressed (Ctrl, Meta/Cmd, Alt)
 * Shift is excluded since it's used for arrow key panning
 */
export function hasModifierKeys(event: KeyboardEvent): boolean {
	return event.ctrlKey || event.metaKey || event.altKey;
}

// =============================================================================
// Keyboard Action Detection
// =============================================================================

export type ViewerKeyAction =
	| { type: "zoom-in" }
	| { type: "zoom-out" }
	| { type: "reset-view" }
	| { type: "cycle-background" }
	| { type: "copy" }
	| { type: "download" }
	| { type: "toggle-raw" }
	| { type: "toggle-help" }
	| { type: "pan"; direction: "up" | "down" | "left" | "right" }
	| null;

/**
 * Detects which viewer action corresponds to a keyboard event.
 * Returns null if no action matches or if user is typing in an input.
 * Each component can then decide whether to execute the action based on its own guards.
 */
export function getViewerKeyAction(
	event: KeyboardEvent,
	hasViewerFocus: boolean,
): ViewerKeyAction {
	if (isTypingInInput()) return null;

	const noModifiers = !hasModifierKeys(event);

	// Shortcuts that require no modifiers
	if (noModifiers) {
		switch (event.key) {
			case "+":
			case "=":
				return { type: "zoom-in" };
			case "-":
			case "_":
				return { type: "zoom-out" };
			case "0":
				return { type: "reset-view" };
			case "b":
			case "B":
				return { type: "cycle-background" };
			case "c":
			case "C":
				return { type: "copy" };
			case "s":
			case "S":
				return { type: "download" };
			case "v":
			case "V":
				return { type: "toggle-raw" };
			case "?":
				return { type: "toggle-help" };
		}
	}

	// Pan controls: require viewer focus and Shift (but no Ctrl/Meta/Alt)
	if (hasViewerFocus && event.shiftKey && noModifiers) {
		switch (event.key) {
			case "ArrowUp":
				return { type: "pan", direction: "up" };
			case "ArrowDown":
				return { type: "pan", direction: "down" };
			case "ArrowLeft":
				return { type: "pan", direction: "left" };
			case "ArrowRight":
				return { type: "pan", direction: "right" };
		}
	}

	return null;
}
