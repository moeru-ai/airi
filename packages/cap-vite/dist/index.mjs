import { t as parseCapacitorPlatform } from "./native-CH9qzgm8.mjs";
import process from "node:process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x } from "tinyexec";

//#region src/index.ts
function resolveWrapperConfigFile() {
	const wrapperExtension = extname(fileURLToPath(import.meta.url)) === ".ts" ? ".ts" : ".mjs";
	return fileURLToPath(new URL(`./vite-wrapper-config${wrapperExtension}`, import.meta.url));
}
function parseViteConfigLoader(value) {
	if (value === "bundle" || value === "native" || value === "runner") return value;
}
function resolveConfigPath(cwd, value) {
	return resolve(cwd, value);
}
function readRequiredOptionValue(viteArgs, index, optionName) {
	const value = viteArgs[index + 1];
	if (!value) throw new Error(`Missing value for \`${optionName}\`.`);
	return value;
}
function parseConfigArg(viteArgs, index, cwd) {
	const arg = viteArgs[index];
	if (arg === "--config" || arg === "-c") return {
		baseConfigFile: resolveConfigPath(cwd, readRequiredOptionValue(viteArgs, index, "--config")),
		consumedArgs: 2,
		forwardedArgs: []
	};
	if (arg.startsWith("--config=")) return {
		baseConfigFile: resolveConfigPath(cwd, arg.slice(9)),
		consumedArgs: 1,
		forwardedArgs: []
	};
	return null;
}
function parseConfigLoaderArg(viteArgs, index) {
	const arg = viteArgs[index];
	if (arg === "--configLoader") {
		const value = readRequiredOptionValue(viteArgs, index, "--configLoader");
		return {
			configLoader: parseViteConfigLoader(value),
			consumedArgs: 2,
			forwardedArgs: [arg, value]
		};
	}
	if (arg.startsWith("--configLoader=")) return {
		configLoader: parseViteConfigLoader(arg.slice(15)),
		consumedArgs: 1,
		forwardedArgs: [arg]
	};
	return null;
}
function parseViteArg(viteArgs, index, cwd) {
	return parseConfigArg(viteArgs, index, cwd) ?? parseConfigLoaderArg(viteArgs, index) ?? {
		consumedArgs: 1,
		forwardedArgs: [viteArgs[index]]
	};
}
function resolveProjectRoot(viteArgs, cwd) {
	const firstArg = viteArgs[0];
	return firstArg && !firstArg.startsWith("-") ? resolve(cwd, firstArg) : cwd;
}
function prepareCapViteLaunch(viteArgs, cwd = process.cwd()) {
	const resolvedCwd = resolve(cwd);
	const projectRoot = resolveProjectRoot(viteArgs, resolvedCwd);
	let baseConfigFile;
	let configLoader;
	const forwardedViteArgs = [];
	for (let index = 0; index < viteArgs.length;) {
		const parsedArg = parseViteArg(viteArgs, index, resolvedCwd);
		baseConfigFile = parsedArg.baseConfigFile ?? baseConfigFile;
		configLoader = parsedArg.configLoader ?? configLoader;
		forwardedViteArgs.push(...parsedArg.forwardedArgs);
		index += parsedArg.consumedArgs;
	}
	return {
		baseConfigFile,
		configLoader,
		projectRoot,
		viteArgs: forwardedViteArgs,
		wrapperConfigFile: resolveWrapperConfigFile()
	};
}
async function runCapVite(viteArgs, capArgs, options = {}) {
	if (!parseCapacitorPlatform(capArgs[0])) throw new Error("The first `cap run` argument must be `ios` or `android`.");
	const cwd = resolve(options.cwd ?? process.cwd());
	const prepared = prepareCapViteLaunch(viteArgs, cwd);
	return await x("vite", [
		"--config",
		prepared.wrapperConfigFile,
		...prepared.viteArgs
	], {
		throwOnError: false,
		nodeOptions: {
			cwd,
			env: {
				CAP_VITE_BASE_CONFIG: prepared.baseConfigFile ?? "",
				CAP_VITE_CAP_ARGS_JSON: JSON.stringify(capArgs),
				CAP_VITE_CONFIG_LOADER: prepared.configLoader ?? "",
				CAP_VITE_ROOT: prepared.projectRoot
			},
			stdio: "inherit"
		}
	});
}

//#endregion
export { prepareCapViteLaunch, runCapVite };
//# sourceMappingURL=index.mjs.map