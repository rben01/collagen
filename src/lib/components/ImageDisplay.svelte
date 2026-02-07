<script lang="ts">
	import ControlButton from "./ControlButton.svelte";
	import Toolbar from "./Toolbar.svelte";
	import ViewerCore from "./ViewerCore.svelte";
	import {
		BACKGROUND_STYLES,
		getViewerKeyAction,
		isTypingInInput,
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

	let viewerCore: ViewerCore | null = $state(null);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let backgroundStyleIndex = $state(1);
	let showInstructions = $state(false);

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
		viewerCore?.showToast("Image downloaded.");
	}

	async function copyToClipboard() {
		if (!imageDataUri) return;
		try {
			const response = await fetch(imageDataUri);
			const blob = await response.blob();
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			]);
			viewerCore?.showToast("Image copied to clipboard.");
		} catch (err) {
			console.error("Failed to copy image to clipboard:", err);
			viewerCore?.showToast("Failed to copy image to clipboard", "error");
		}
	}

	function toggleInstructions() {
		showInstructions = !showInstructions;
	}

	function handleImageLoad(event: Event) {
		const img = event.target as HTMLImageElement;
		naturalWidth = img.naturalWidth;
		naturalHeight = img.naturalHeight;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (isTypingInInput()) return;

		const hasViewerFocus = viewerCore?.hasFocus() ?? false;
		const action = getViewerKeyAction(event, hasViewerFocus);
		if (!action) return;

		let handled = true;
		switch (action.type) {
			case "zoom-in":
				viewerCore?.zoomIn();
				break;
			case "zoom-out":
				viewerCore?.zoomOut();
				break;
			case "reset-view":
				viewerCore?.resetView();
				break;
			case "cycle-background":
				viewerCore?.cycleBackgroundStyle();
				break;
			case "pan":
				viewerCore?.pan(action.direction);
				break;
			case "toggle-help":
				toggleInstructions();
				break;
			case "copy":
				copyToClipboard();
				break;
			case "download":
				downloadImage();
				break;
			default:
				handled = false;
		}

		if (handled) event.preventDefault();
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="viewer-display">
	<Toolbar ariaLabel="Image viewer controls">
		<div class="control-group">
			<ControlButton
				action="zoom-in"
				title="Zoom In (Keyboard: +)"
				ariaLabel="Zoom in, keyboard shortcut plus key"
				onclick={() => viewerCore?.zoomIn()}
			/>
			<ControlButton
				action="zoom-out"
				title="Zoom Out (Keyboard: -)"
				ariaLabel="Zoom out, keyboard shortcut minus key"
				onclick={() => viewerCore?.zoomOut()}
			/>
			<ControlButton
				action="reset-view"
				title="Reset View (Keyboard: 0)"
				ariaLabel="Reset view, keyboard shortcut zero key"
				onclick={() => viewerCore?.resetView()}
			/>
			<span class="zoom-level">{Math.round(scale * 100)}%</span>
		</div>

		<div class="file-label" title={imagePath}>{imagePath}</div>

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
				ariaLabel="Change background style from {BACKGROUND_STYLES[
					backgroundStyleIndex
				].name} to {BACKGROUND_STYLES[
					(backgroundStyleIndex + 1) % BACKGROUND_STYLES.length
				].name}, keyboard shortcut B key"
				onclick={() => viewerCore?.cycleBackgroundStyle()}
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
		<ViewerCore
			bind:this={viewerCore}
			kind="image"
			contentWidth={naturalWidth}
			contentHeight={naturalHeight}
			bind:scale
			bind:panX
			bind:panY
			bind:backgroundStyleIndex
			bind:showInstructions
			ariaLabel="Interactive image viewer"
		>
			{#snippet children({ constrainedDimensions })}
				<img
					src={imageDataUri}
					alt={imagePath}
					width={constrainedDimensions.width}
					style="object-fit:contain;"
					onload={handleImageLoad}
				/>
			{/snippet}
		</ViewerCore>
	{:else}
		<div class="viewer-error">
			<p>Failed to load image: {imagePath}</p>
		</div>
	{/if}
</div>

<style>
	.viewer-display {
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

	img {
		pointer-events: none;
	}

	.zoom-level {
		font-family: monospace;
		font-size: 0.875em;
		color: #6b7280;
		min-width: 3em;
		text-align: center;
	}

	.viewer-error {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fef2f2;
		color: #dc2626;
		font-size: 1.1em;
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
</style>
