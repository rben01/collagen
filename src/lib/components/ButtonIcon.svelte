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
		min-width: 22px;
		min-height: 22px;
		mask-size: 100%;
		mask-position: center;
		mask-repeat: no-repeat;
	}

	div.active {
		background-color: white;
	}

	.background {
		--btn-bg: url("@tabler-icons/outline/palette.svg");
	}

	.zoom-in {
		--btn-bg: url("@tabler-icons/outline/zoom-in.svg");
	}

	.zoom-out {
		--btn-bg: url("@tabler-icons/outline/zoom-out.svg");
	}

	.reset-view {
		--btn-bg: url("@tabler-icons/outline/focus-centered.svg");
	}

	.help {
		--btn-bg: url("@tabler-icons/outline/help.svg");
	}

	.toggle-view {
		--btn-bg: url("@tabler-icons/outline/code.svg");
	}

	.copy {
		--btn-bg: url("@tabler-icons/outline/clipboard-copy.svg");
	}

	.export-svg {
		--btn-bg: url("@tabler-icons/outline/photo-down.svg");
	}

	.export-image {
		--btn-bg: url("@tabler-icons/outline/photo-down.svg");
	}

	.trash {
		--btn-bg: url("@tabler-icons/outline/trash.svg");
	}

	.minimize-editor {
		--btn-bg: url("@tabler-icons/filled/layout-sidebar-left-collapse.svg");
	}

	.download-project {
		--btn-bg: url("@tabler-icons/outline/folder-down.svg");
	}

	.tool-select {
		--btn-bg: url("@tabler-icons/outline/pointer.svg");
	}

	.tool-pan {
		--btn-bg: url("@tabler-icons/outline/hand-stop.svg");
	}

	.tool-rect {
		--btn-bg: url("@tabler-icons/outline/square.svg");
	}

	.tool-ellipse {
		--btn-bg: url("@tabler-icons/outline/circle.svg");
	}

	.tool-line {
		--btn-bg: url("@tabler-icons/outline/line.svg");
	}

	.tool-text {
		--btn-bg: url("@tabler-icons/outline/typography.svg");
	}

	.tool-image {
		--btn-bg: url("@tabler-icons/outline/photo.svg");
	}

	.gui-mode {
		--btn-bg: url("@tabler-icons/outline/click.svg");
	}

	.code-mode {
		--btn-bg: url("@tabler-icons/outline/code.svg");
	}

	.detach {
		--btn-bg: url("@tabler-icons/outline/arrows-split.svg");
	}

	@media (max-width: 1024px) {
		.minimize-editor {
			--btn-bg: url("@tabler-icons/filled/layout-bottombar-collapse.svg");
		}
	}
</style>
