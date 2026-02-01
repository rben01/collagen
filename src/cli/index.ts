import { program } from "commander";
import { runOnce, runWatch } from "./run.js";

program
	.name("clgn")
	.description("Collagen: The Collage Generator")
	.requiredOption("-i, --input <path>", "Input skeleton folder")
	.requiredOption("-o, --out-file <path>", "Output SVG file (- for stdout)")
	.option("-f, --format <format>", "Manifest format: json or jsonnet")
	.option("--watch", "Watch mode: re-run on file changes")
	.option("--debounce <ms>", "Watch debounce in ms", "250")
	.action(async options => {
		if (options.watch) {
			await runWatch(options);
		} else {
			await runOnce(options);
		}
	});

program.parse();
