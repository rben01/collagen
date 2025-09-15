<script lang="ts">
	import type { ButtonAction } from "./ButtonIcon";

	let { action, active = false }: { action: ButtonAction; active?: boolean } =
		$props();
</script>

<div class={action} class:active></div>

<style>
	div {
		-webkit-mask-image: var(--btn-bg);
		mask-image: var(--btn-bg);
		background-color: #374151;
		min-width: 20px;
		min-height: 20px;
		mask-size: 100%;
		mask-repeat: no-repeat;
	}

	div.active {
		background-color: white;
	}

	.zoom-in {
		--btn-bg: url("$lib/icons/zoom-in.svg");
	}

	.zoom-out {
		--btn-bg: url("$lib/icons/zoom-out.svg");
	}

	.reset-view {
		--btn-bg: url("$lib/icons/focus-centered.svg");
	}

	.help {
		--btn-bg: url("$lib/icons/help.svg");
	}

	.toggle-view {
		--btn-bg: url("$lib/icons/code.svg");
	}

	.copy {
		--btn-bg: url("$lib/icons/clipboard-copy.svg");
	}

	.export-svg {
		--btn-bg: url("$lib/icons/file-download.svg");
	}

	.trash {
		--btn-bg: url("$lib/icons/trash-bin.svg");
	}

	.minimize-editor {
		--btn-bg: url("$lib/icons/editor-minimize.svg");
	}

	.download-project {
		--btn-bg: url("$lib/icons/file-download.svg");
	}

	@media (max-width: 1024px) {
		.minimize-editor {
			--btn-bg: url("$lib/icons/editor-minimize-down.svg");
		}
	}
</style>
