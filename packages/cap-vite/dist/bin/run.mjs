#!/usr/bin/env node
import { runCapVite } from "../index.mjs";
import process from "node:process";

//#region src/cli.ts
const usage = "cap-vite [vite args...] -- <ios|android> [cap run args...]";
const helpText = [
	"Run a Vite dev server and forward a second argument group to `cap run`.",
	"",
	"Usage:",
	`  ${usage}`,
	"",
	"Examples:",
	"  cap-vite -- ios --target \"iPhone 16 Pro\"",
	"  cap-vite --host 0.0.0.0 --port 5173 -- android --target emulator-5554 --flavor release",
	"",
	"Notes:",
	"  Arguments before `--` are forwarded to Vite.",
	"  Arguments after `--` are forwarded to `cap run`."
].join("\n");
function getCapViteCliHelpText() {
	return helpText;
}
function parseCapViteCliArgs(argv) {
	if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return null;
	const separatorIndex = argv.indexOf("--");
	if (separatorIndex === -1) throw new Error(usage);
	const capArgs = argv.slice(separatorIndex + 1);
	if (capArgs.length === 0) throw new Error(usage);
	const platform = capArgs[0];
	if (platform !== "android" && platform !== "ios") throw new Error(usage);
	return {
		capArgs,
		viteArgs: argv.slice(0, separatorIndex)
	};
}

//#endregion
//#region src/bin/run.ts
async function main() {
	const parsed = parseCapViteCliArgs(process.argv.slice(2));
	if (!parsed) {
		process.stdout.write(`${getCapViteCliHelpText()}\n`);
		return;
	}
	const result = await runCapVite(parsed.viteArgs, parsed.capArgs);
	if (typeof result.exitCode === "number") process.exitCode = result.exitCode;
}
main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});

//#endregion
export {  };
//# sourceMappingURL=run.mjs.map