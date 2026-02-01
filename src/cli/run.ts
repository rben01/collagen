import { writeFile } from "node:fs/promises";
import chokidar from "chokidar";
import { loadFromDisk } from "./disk-loader.js";
import { formatError, type ManifestFormat } from "../lib/collagen-ts/index.js";
import { getManifestPath } from "../lib/collagen-ts/filesystem/index.js";

export interface CliOptions {
	input: string;
	outFile: string;
	format?: string;
	watch?: boolean;
	debounce: string;
}

async function generate(options: CliOptions): Promise<string> {
	const fs = await loadFromDisk(options.input);

	if (options.format) {
		const format = options.format as ManifestFormat;
		const manifestPath = getManifestPath(format);
		if (!fs.has(manifestPath)) {
			throw new Error(
				`Manifest file not found: ${manifestPath} (specified via --format)`,
			);
		}
		const otherFormat: ManifestFormat =
			format === "json" ? "jsonnet" : "json";
		const otherPath = getManifestPath(otherFormat);
		fs.removeFile(otherPath);
	}

	return await fs.generateSvg();
}

async function writeOutput(svg: string, outFile: string): Promise<void> {
	if (outFile === "-") {
		process.stdout.write(svg);
	} else {
		await writeFile(outFile, svg, "utf-8");
	}
}

export async function runOnce(options: CliOptions): Promise<void> {
	try {
		const svg = await generate(options);
		await writeOutput(svg, options.outFile);
	} catch (err) {
		console.error(formatError(err));
		process.exit(1);
	}
}

export async function runWatch(options: CliOptions): Promise<void> {
	const { input, outFile, debounce } = options;
	const debounceMs = parseInt(debounce, 10);

	async function run() {
		try {
			const svg = await generate(options);
			await writeOutput(svg, outFile);
			if (outFile !== "-") {
				console.error(`Success; output to ${outFile}`);
			}
		} catch (err) {
			console.error(`Error: ${formatError(err)}`);
		}
	}

	await run();

	let timeout: NodeJS.Timeout | null = null;
	const watcher = chokidar.watch(input, {
		ignoreInitial: true,
		persistent: true,
	});

	watcher.on("all", (event, path) => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(async () => {
			console.error(`Rerunning due to ${event}: ${path}`);
			await run();
		}, debounceMs);
	});

	console.error(`Watching ${input} for changes...`);
}
