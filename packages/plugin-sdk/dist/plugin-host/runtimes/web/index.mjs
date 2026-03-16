import { n as PluginHost, r as manifestV1Schema, t as FileSystemLoader } from "../../../core-CLaadm8a.mjs";
import { createContext } from "@moeru/eventa";

//#region src/plugin-host/runtimes/web/index.ts
function createPluginContext(transport) {
	switch (transport.kind) {
		case "in-memory": return createContext();
		case "websocket": throw new Error("WebSocket transport is not implemented for web runtime yet.");
		case "web-worker": throw new Error("Web worker transport is not implemented yet.");
		case "node-worker": throw new Error("Node worker transport is not available in web runtime.");
		case "electron": throw new Error("Electron transport is not available in web runtime.");
		default: throw new Error("Unknown plugin transport kind.");
	}
}

//#endregion
export { FileSystemLoader, PluginHost, createPluginContext, manifestV1Schema };