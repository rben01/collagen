/**
 * State for the visual editor.
 *
 * Kept in a class rather than more `$state` in `+page.svelte`, which already
 * holds about twenty of them. It is instantiated by the page and passed down,
 * rather than exported as a module singleton, because module state is shared
 * across renders and this app prerenders.
 */

/** What a click on the canvas does. */
export type Tool = "select" | "pan" | "rect" | "ellipse" | "line" | "text";

/** A drag in progress on the canvas. */
export type Gesture =
	| { kind: "none" }
	| { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
	| {
			kind: "move";
			path: string;
			startX: number;
			startY: number;
			dx: number;
			dy: number;
			/** True once the pointer has travelled far enough to be a drag. */
			moved: boolean;
	  }
	| {
			kind: "resize";
			path: string;
			handle: ResizeHandle;
			startX: number;
			startY: number;
			dx: number;
			dy: number;
			moved: boolean;
	  }
	| {
			kind: "draw";
			/** Where the drag began, in the drawing's own user units. */
			startX: number;
			startY: number;
			/** Where it is now, in the same units. */
			x: number;
			y: number;
			/** Where the press landed on screen, for measuring the threshold. */
			pressX: number;
			pressY: number;
			moved: boolean;
	  };

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export class EditorState {
	tool = $state<Tool>("select");
	selectedPath = $state<string | null>(null);
	hoveredPath = $state<string | null>(null);
	gesture = $state<Gesture>({ kind: "none" });

	/** Why write-back is unavailable, or null when the manifest is editable. */
	readOnlyReason = $state<string | null>(null);

	/** The last thing the editor refused to do, shown next to the selection. */
	notice = $state<string | null>(null);

	/** True while a gesture is being previewed but not yet written. */
	get isDragging(): boolean {
		return this.gesture.kind !== "none";
	}

	select(path: string | null): void {
		this.selectedPath = path;
		this.notice = null;
	}
}
