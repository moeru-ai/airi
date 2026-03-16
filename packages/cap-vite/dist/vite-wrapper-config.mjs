import { capVitePlugin } from "./vite-plugin.mjs";
import process from "node:process";
import { defineConfig, loadConfigFromFile, mergeConfig } from "vite";

//#region src/vite-wrapper-config.ts
function parseCapArgs() {
	const value = process.env.CAP_VITE_CAP_ARGS_JSON;
	if (!value) return [];
	const parsed = JSON.parse(value);
	if (!Array.isArray(parsed) || parsed.some((arg) => typeof arg !== "string")) throw new Error("CAP_VITE_CAP_ARGS_JSON must be a JSON string array.");
	return parsed;
}
function parseConfigLoader() {
	const value = process.env.CAP_VITE_CONFIG_LOADER;
	if (value === "bundle" || value === "native" || value === "runner") return value;
}
var vite_wrapper_config_default = defineConfig(async (env) => {
	const root = process.env.CAP_VITE_ROOT ?? process.cwd();
	return mergeConfig((await loadConfigFromFile(env, process.env.CAP_VITE_BASE_CONFIG || void 0, root, void 0, void 0, parseConfigLoader()))?.config ?? {}, { plugins: [capVitePlugin({ capArgs: parseCapArgs() })] });
});

//#endregion
export { vite_wrapper_config_default as default };
//# sourceMappingURL=vite-wrapper-config.mjs.map