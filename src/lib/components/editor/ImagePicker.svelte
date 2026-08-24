<script lang="ts">
	import {
		getMimeType,
		isImagePath,
		type InMemoryFileSystem,
	} from "$lib/collagen-ts/filesystem/index.js";

	/** One of the project's images, ready to preview and place. */
	export interface ProjectImage {
		path: string;
		/** Object URL for the preview. Revoked when the list is rebuilt. */
		url: string;
		/** Intrinsic size, once the browser has decoded it. */
		naturalWidth: number | null;
		naturalHeight: number | null;
	}

	let {
		filesystem,
		selected = $bindable(),
		images = $bindable(),
	}: {
		filesystem: InMemoryFileSystem;
		/** The path the Image tool will place, or null. */
		selected: string | null;
		/** Published upward so placement can read intrinsic sizes. */
		images: ProjectImage[];
	} = $props();

	/**
	 * Build a previewable list of the project's images.
	 *
	 * Object URLs rather than the base64 data URIs `ImageDisplay` uses: this
	 * shows every image in the project at once, and encoding them all into
	 * strings would hold a second, larger copy of each in memory.
	 */
	$effect(() => {
		const built: ProjectImage[] = [];
		for (const [path, content] of filesystem.files) {
			if (!isImagePath(path)) continue;
			const blob = new Blob([content.bytes as BlobPart], {
				type: getMimeType(path),
			});
			built.push({
				path,
				url: URL.createObjectURL(blob),
				naturalWidth: null,
				naturalHeight: null,
			});
		}
		built.sort((a, b) => a.path.localeCompare(b.path));
		images = built;

		// A project with exactly one image needs no choosing.
		if (selected === null && built.length === 1) selected = built[0].path;
		// A previously chosen image may have been removed since.
		if (selected !== null && !built.some(image => image.path === selected)) {
			selected = built.length === 1 ? built[0].path : null;
		}

		return () => {
			for (const image of built) URL.revokeObjectURL(image.url);
		};
	});

	/** Record an image's intrinsic size once the browser reports it. */
	function measure(path: string, element: EventTarget & Element) {
		if (!(element instanceof HTMLImageElement)) return;

		for (const image of images) {
			if (image.path !== path) continue;
			image.naturalWidth = element.naturalWidth;
			image.naturalHeight = element.naturalHeight;
		}
	}

	function basename(path: string): string {
		const slash = path.lastIndexOf("/");
		return slash === -1 ? path : path.slice(slash + 1);
	}
</script>

<div class="picker">
	<h3>Place an image</h3>

	{#if images.length === 0}
		<p class="empty">
			This project has no images yet. Add one to the file list on the left,
			then come back.
		</p>
	{:else}
		<p class="hint">
			Choose an image, then drag a box on the canvas to place it.
		</p>
		<ul>
			{#each images as image (image.path)}
				<li>
					<button
						type="button"
						class="choice"
						class:chosen={selected === image.path}
						aria-pressed={selected === image.path}
						title={image.path}
						onclick={() => (selected = image.path)}
					>
						<img
							src={image.url}
							alt=""
							onload={event => measure(image.path, event.currentTarget)}
						/>
						<span class="name">{basename(image.path)}</span>
						{#if image.naturalWidth && image.naturalHeight}
							<span class="size">
								{image.naturalWidth}&times;{image.naturalHeight}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: auto;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid #e5e7eb;
	}

	h3 {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.empty,
	.hint {
		margin: 0 0 0.5rem;
		font-size: 0.8em;
		color: #6b7280;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.25em 0.4em;
		border: 1px solid transparent;
		border-radius: 0.375em;
		background: none;
		font: inherit;
		font-size: 0.82em;
		color: #374151;
		text-align: left;
		cursor: pointer;
	}

	.choice:hover {
		background: #f3f4f6;
	}

	.choice.chosen {
		border-color: #2563eb;
		background: #eff6ff;
	}

	.choice:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: 1px;
	}

	img {
		width: 2.25em;
		height: 2.25em;
		object-fit: contain;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.25em;
		flex: 0 0 auto;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size {
		margin-left: auto;
		color: #9ca3af;
		font-variant-numeric: tabular-nums;
		flex: 0 0 auto;
	}
</style>
