<script lang="ts">
	import { flip } from "svelte/animate";
	import { quintInOut } from "svelte/easing";
	import { fly } from "svelte/transition";

	export interface Toast {
		id: number;
		message: string;
		type: string;
	}

	let {
		toasts,
		onRemove,
	}: { toasts: Toast[]; onRemove: (id: number) => void } = $props();
</script>

<div class="toast-container">
	{#each toasts as toast (toast.id)}
		<div
			class="toast toast-{toast.type}"
			role="alert"
			transition:fly={{ duration: 300, x: "100%" }}
			animate:flip={{ duration: 300, easing: quintInOut }}
		>
			<span>{toast.message}</span>
			<button
				class="toast-close"
				onclick={() => onRemove(toast.id)}
				tabindex="0">✕</button
			>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: absolute;
		top: 4.5em;
		right: 1em;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5em;
		pointer-events: none;
	}

	.toast {
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375em;
		padding: 0.75em 1em;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75em;
		max-width: 300px;
		width: fit-content;
		font-size: 0.875em;
		pointer-events: auto;
	}

	.toast-success {
		border-color: #10b981;
		background: #ecfdf5;
		color: #065f46;
	}

	.toast-error {
		border-color: #ef4444;
		background: #fef2f2;
		color: #991b1b;
	}

	.toast-close {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.2em;
		line-height: 1;
		padding: 0;
		margin: 0;
		color: inherit;
		opacity: 0.6;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.toast-close:hover {
		opacity: 1;
	}
</style>
