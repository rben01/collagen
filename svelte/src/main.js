import App from "./App.svelte";
import wasm from "../../rust/Cargo.toml";

const app = new App({
	target: document.body,
	props: {
		name: "world",
	},
});

async function init() {
	const bindings = await wasm();
	const app = new App({
		target: document.body,
		props: {
			bindings,
		},
	});
}

init();
