import process from "node:process";
import { basename, extname, relative, resolve, sep } from "node:path";

//#region src/native.ts
const nativeExtensionsByPlatform = {
	ios: new Set([
		".entitlements",
		".h",
		".hpp",
		".m",
		".mm",
		".pbxproj",
		".plist",
		".storyboard",
		".strings",
		".swift",
		".xcodeproj",
		".xcconfig",
		".xcscheme",
		".xib"
	]),
	android: new Set([
		".gradle",
		".java",
		".json",
		".kts",
		".kt",
		".properties",
		".xml"
	])
};
const nativeNamesByPlatform = {
	ios: new Set([
		"Podfile",
		"Podfile.lock",
		"project.pbxproj"
	]),
	android: new Set([
		"AndroidManifest.xml",
		"build.gradle",
		"build.gradle.kts",
		"gradle.properties",
		"settings.gradle",
		"settings.gradle.kts"
	])
};
const ignoredNames = new Set(["capacitor.config.json"]);
const ignoredPathSegments = new Set([
	".gradle",
	"DerivedData",
	"Pods",
	"build",
	"xcuserdata"
]);
const ignoredPathPrefixesByPlatform = {
	ios: [["App", "CapApp-SPM"]],
	android: [
		[
			"app",
			"src",
			"main",
			"assets",
			"public"
		],
		[
			"app",
			"src",
			"main",
			"assets",
			"capacitor.plugins.json"
		],
		[
			"app",
			"src",
			"main",
			"res",
			"xml",
			"config.xml"
		],
		["app", "capacitor.build.gradle"],
		["capacitor-cordova-android-plugins"],
		["capacitor.settings.gradle"]
	]
};
function parseCapacitorPlatform(value) {
	return value === "android" || value === "ios" ? value : null;
}
function hasCapacitorTargetArg(capArgs) {
	return capArgs.some((arg, index) => arg === "--target" || index > 0 && arg.startsWith("--target="));
}
function resolveCapRunArgs(capArgs, env = process.env) {
	if (capArgs.length === 0 || hasCapacitorTargetArg(capArgs)) return capArgs;
	const target = env.CAPACITOR_DEVICE_ID;
	if (!target) return capArgs;
	const [platform, ...rest] = capArgs;
	return [
		platform,
		"--target",
		target,
		...rest
	];
}
function pickServerUrl(server) {
	const url = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
	if (!url) throw new Error("Vite did not expose a reachable dev server URL.");
	return new URL(url);
}
function shouldRestartForNativeChange(file, platform, cwd) {
	const absoluteFile = resolve(cwd, file);
	const platformRoot = resolve(cwd, platform);
	if (!absoluteFile.startsWith(`${platformRoot}${sep}`) && absoluteFile !== platformRoot) return false;
	const fileName = basename(absoluteFile);
	if (ignoredNames.has(fileName)) return false;
	if (absoluteFile.split(sep).some((segment) => ignoredPathSegments.has(segment))) return false;
	const relativeSegments = relative(platformRoot, absoluteFile).split(sep).filter(Boolean);
	if (ignoredPathPrefixesByPlatform[platform].some((prefix) => prefix.every((segment, index) => relativeSegments[index] === segment))) return false;
	if (nativeNamesByPlatform[platform].has(fileName)) return true;
	return nativeExtensionsByPlatform[platform].has(extname(fileName).toLowerCase());
}

//#endregion
export { shouldRestartForNativeChange as i, pickServerUrl as n, resolveCapRunArgs as r, parseCapacitorPlatform as t };
//# sourceMappingURL=native-CH9qzgm8.mjs.map