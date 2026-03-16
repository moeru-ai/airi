import { normalizeLoggerConfig, setupApp } from "./index.mjs";
import { useLogg } from "@guiiai/logg";
import { serve } from "h3";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { merge } from "@moeru/std";
import { plugin } from "crossws/server";

//#region src/server/index.ts
function getLocalIPs() {
	const interfaces = networkInterfaces();
	const addresses = [];
	const VIRTUAL_INTERFACE_PREFIXES = [
		"vboxnet",
		"vmnet",
		"docker",
		"br-",
		"veth",
		"utun",
		"wg",
		"tap",
		"tun"
	];
	const isVirtualInterface = (name) => VIRTUAL_INTERFACE_PREFIXES.some((prefix) => name.startsWith(prefix));
	for (const [name, entries] of Object.entries(interfaces)) {
		if (!entries) continue;
		if (isVirtualInterface(name)) continue;
		for (const entry of entries) {
			const rawAddress = entry.address;
			if (!rawAddress) continue;
			const address = rawAddress.includes("%") ? rawAddress.split("%")[0] : rawAddress;
			if (isIP(address)) addresses.push(address);
		}
	}
	return addresses;
}
function createServer(opts) {
	let options = merge({
		port: 6121,
		hostname: "0.0.0.0"
	}, opts);
	const { appLogFormat, appLogLevel } = normalizeLoggerConfig(options);
	const log = useLogg("@proj-airi/server-runtime/server").withLogLevelString(appLogLevel).withFormat(appLogFormat);
	let serverInstance = null;
	log.withFields({ hasTlsConfig: !!options?.tlsConfig }).log("creating server channel");
	async function closeServer(closeActiveConnections = false) {
		if (!serverInstance || typeof serverInstance.close !== "function") return;
		try {
			if (closeActiveConnections) log.log("closing existing server instance");
			await serverInstance.close(closeActiveConnections);
			if (closeActiveConnections) log.log("existing server instance closed");
		} catch (error) {
			const nodejsError = error;
			if ("code" in nodejsError && nodejsError.code === "ERR_SERVER_NOT_RUNNING") return;
			log.withError(error).error("Error closing WebSocket server");
		} finally {
			serverInstance = null;
		}
	}
	async function start() {
		if (serverInstance) return;
		const secureEnabled = options?.tlsConfig != null;
		try {
			const h3App = setupApp();
			const port = options.port;
			const hostname = options.hostname;
			const instance = serve(h3App.app, {
				plugins: [plugin({ resolve: async (req) => (await h3App.app.fetch(req)).crossws })],
				port,
				hostname,
				tls: options?.tlsConfig || void 0,
				reusePort: true,
				silent: true,
				manual: true,
				gracefulShutdown: {
					forceTimeout: .5,
					gracefulTimeout: .5
				}
			});
			serverInstance = { close: async (closeActiveConnections = false) => {
				log.log("closing all peers");
				h3App.closeAllPeers();
				log.log("closing server instance");
				await instance.close(closeActiveConnections);
				log.log("server instance closed");
			} };
			const servePromise = instance.serve();
			if (servePromise instanceof Promise) servePromise.catch((error) => {
				const nodejsError = error;
				if ("code" in nodejsError && nodejsError.code === "EADDRINUSE") {
					log.withError(error).warn("Port already in use, assuming server is already running");
					return;
				}
				log.withError(error).error("Error serving WebSocket server");
			});
			const protocol = secureEnabled ? "wss" : "ws";
			if (hostname === "0.0.0.0") {
				const ips = getLocalIPs().filter((ip) => ip !== "127.0.0.1" && ip !== "::1");
				const targets = ips.length > 0 ? ips.join(", ") : "localhost";
				log.log(`@proj-airi/server-runtime started on ${protocol}://0.0.0.0:${port} (reachable via: ${targets})`);
			} else log.log(`@proj-airi/server-runtime started on ${protocol}://${hostname}:${port}`);
		} catch (error) {
			log.withError(error).error("failed to start WebSocket server");
		}
	}
	async function stop() {
		await closeServer(true);
	}
	async function restart() {
		log.log("restarting server channel", { options });
		await closeServer(true);
		await start();
	}
	async function updateConfig(newOptions) {
		options = {
			...options,
			...newOptions
		};
	}
	return {
		getConnectionHost: () => {
			return getLocalIPs();
		},
		start,
		stop,
		restart,
		updateConfig
	};
}

//#endregion
export { createServer, getLocalIPs };