<script lang="ts">
	import ButtonIcon from "./ButtonIcon.svelte";
	import type { ButtonAction } from "./ButtonIcon";
	import type { Snippet } from "svelte";

	let {
		action,
		ariaLabel,
		title,
		active = false,
		disabled = false,
		onclick,
		tabindex = 0,
		children,
	}: {
		action: ButtonAction;
		ariaLabel?: string;
		title?: string;
		active?: boolean;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		tabindex?: number;
		children?: Snippet;
	} = $props();
</script>

<button
	class="control-btn"
	class:active
	{disabled}
	title={disabled ? null : title}
	aria-label={ariaLabel}
	{tabindex}
	{onclick}
>
	<ButtonIcon {action} {active} />
	{@render children?.()}
</button>

<style>
	.control-btn {
		background: #ffffff;
		border: 1px solid #d1d5db;
		padding: 6px;
		aspect-ratio: 1;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875em;
		transition: all 0.1s ease-out;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.control-btn:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.control-btn:focus {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
		background: #f3f4f6;
		border-color: #2563eb;
	}

	.control-btn.active {
		background: #2563eb;
		border-color: #2563eb;
		color: white;
	}

	.control-btn.active:focus {
		outline: 2px solid #1d4ed8;
		outline-offset: 2px;
		background: #1d4ed8;
		border-color: #1d4ed8;
	}

	.control-btn:disabled {
		background: #f9fafb;
		border-color: #e5e7eb;
		color: #9ca3af;
		cursor: not-allowed;
		opacity: 0.6;
	}

	.control-btn:disabled:hover {
		background: #f9fafb;
		border-color: #e5e7eb;
	}
</style>
