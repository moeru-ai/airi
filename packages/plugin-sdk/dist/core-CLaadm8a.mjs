import { createPluginContext } from "./plugin-host/runtimes/node/index.mjs";
import { isAbsolute, join } from "node:path";
import { cwd } from "node:process";
import { defineInvoke, defineInvokeEventa, defineInvokeHandler } from "@moeru/eventa";
import { moduleAnnounce, moduleAuthenticate, moduleAuthenticated, moduleCompatibilityRequest, moduleCompatibilityResult, moduleConfigurationConfigured, moduleConfigurationNeeded, modulePrepared, moduleStatus, registryModulesSync } from "@proj-airi/plugin-protocol/types";
import { literal, object, optional, string } from "valibot";
import { createActor, createMachine } from "xstate";

//#region src/plugin/apis/protocol/capabilities/index.ts
const protocolCapabilityWait = defineInvokeEventa("proj-airi:plugin-sdk:apis:protocol:capabilities:wait");
const protocolCapabilitySnapshot = defineInvokeEventa("proj-airi:plugin-sdk:apis:protocol:capabilities:snapshot");

//#endregion
//#region src/plugin/apis/protocol/resources/providers/index.ts
const protocolListProvidersEventName = "proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers";
const protocolListProviders = defineInvokeEventa(protocolListProvidersEventName);
const protocolProviders = { listProviders: protocolListProviders };

//#endregion
//#region src/plugin/apis/client/resources/providers/index.ts
function createProviders(ctx) {
	return { async listProviders() {
		await defineInvoke(ctx, protocolCapabilityWait)({ key: protocolListProvidersEventName });
		return await defineInvoke(ctx, protocolListProviders)();
	} };
}

//#endregion
//#region src/plugin/apis/client/index.ts
function createApis(ctx) {
	return { providers: createProviders(ctx) };
}

//#endregion
//#region src/plugin-host/core.ts
const pluginLifecycleMachine = createMachine({
	id: "plugin-lifecycle",
	initial: "loading",
	states: {
		"loading": { on: {
			SESSION_LOADED: "loaded",
			SESSION_FAILED: "failed"
		} },
		"loaded": { on: {
			START_AUTHENTICATION: "authenticating",
			STOP: "stopped",
			SESSION_FAILED: "failed"
		} },
		"authenticating": { on: {
			AUTHENTICATED: "authenticated",
			SESSION_FAILED: "failed"
		} },
		"authenticated": { on: {
			ANNOUNCED: "announced",
			SESSION_FAILED: "failed"
		} },
		"announced": { on: {
			START_PREPARING: "preparing",
			CONFIGURATION_NEEDED: "configuration-needed",
			STOP: "stopped",
			SESSION_FAILED: "failed"
		} },
		"preparing": { on: {
			WAITING_DEPENDENCIES: "waiting-deps",
			PREPARED: "prepared",
			SESSION_FAILED: "failed"
		} },
		"waiting-deps": { on: {
			PREPARED: "prepared",
			SESSION_FAILED: "failed"
		} },
		"prepared": { on: {
			CONFIGURATION_NEEDED: "configuration-needed",
			CONFIGURED: "configured",
			SESSION_FAILED: "failed"
		} },
		"configuration-needed": { on: {
			CONFIGURED: "configured",
			SESSION_FAILED: "failed"
		} },
		"configured": { on: {
			READY: "ready",
			SESSION_FAILED: "failed"
		} },
		"ready": { on: {
			REANNOUNCE: "announced",
			CONFIGURATION_NEEDED: "configuration-needed",
			STOP: "stopped",
			SESSION_FAILED: "failed"
		} },
		"failed": { on: { STOP: "stopped" } },
		"stopped": { type: "final" }
	}
});
const lifecycleTransitionEvents = {
	"loading": {
		loaded: "SESSION_LOADED",
		failed: "SESSION_FAILED"
	},
	"loaded": {
		authenticating: "START_AUTHENTICATION",
		stopped: "STOP",
		failed: "SESSION_FAILED"
	},
	"authenticating": {
		authenticated: "AUTHENTICATED",
		failed: "SESSION_FAILED"
	},
	"authenticated": {
		announced: "ANNOUNCED",
		failed: "SESSION_FAILED"
	},
	"announced": {
		"preparing": "START_PREPARING",
		"configuration-needed": "CONFIGURATION_NEEDED",
		"failed": "SESSION_FAILED",
		"stopped": "STOP"
	},
	"preparing": {
		"waiting-deps": "WAITING_DEPENDENCIES",
		"prepared": "PREPARED",
		"failed": "SESSION_FAILED"
	},
	"waiting-deps": {
		prepared: "PREPARED",
		failed: "SESSION_FAILED"
	},
	"prepared": {
		"configuration-needed": "CONFIGURATION_NEEDED",
		"configured": "CONFIGURED",
		"failed": "SESSION_FAILED"
	},
	"configuration-needed": {
		configured: "CONFIGURED",
		failed: "SESSION_FAILED"
	},
	"configured": {
		ready: "READY",
		failed: "SESSION_FAILED"
	},
	"ready": {
		"announced": "REANNOUNCE",
		"configuration-needed": "CONFIGURATION_NEEDED",
		"failed": "SESSION_FAILED",
		"stopped": "STOP"
	},
	"failed": { stopped: "STOP" },
	"stopped": {}
};
function assertTransition(session, to) {
	const eventType = lifecycleTransitionEvents[session.phase][to];
	if (!eventType) throw new Error(`Invalid plugin lifecycle transition: ${session.phase} -> ${to} for module ${session.identity.id}`);
	const event = { type: eventType };
	if (!session.lifecycle.getSnapshot().can(event)) throw new Error(`Invalid plugin lifecycle transition: ${session.phase} -> ${to} for module ${session.identity.id}`);
	session.lifecycle.send(event);
	session.phase = session.lifecycle.getSnapshot().value;
}
function markFailedTransition(session) {
	const event = { type: "SESSION_FAILED" };
	if (session.lifecycle.getSnapshot().can(event)) {
		session.lifecycle.send(event);
		session.phase = session.lifecycle.getSnapshot().value;
		return;
	}
	if (session.phase !== "failed") session.phase = "failed";
}
function isPluginDefinition(value) {
	return typeof value === "object" && value !== null && "setup" in value && typeof value.setup === "function";
}
async function coercePluginFromModule(moduleValue) {
	if (isPluginDefinition(moduleValue)) return await moduleValue.setup();
	if (typeof moduleValue === "object" && moduleValue !== null) {
		if ("default" in moduleValue && isPluginDefinition(moduleValue.default)) return await moduleValue.default.setup();
		if ("default" in moduleValue && typeof moduleValue.default === "object") {
			const defaultPlugin = moduleValue.default;
			if (typeof defaultPlugin.init === "function" || typeof defaultPlugin.setupModules === "function") return defaultPlugin;
		}
		const plugin = moduleValue;
		if (typeof plugin.init === "function" || typeof plugin.setupModules === "function") return plugin;
	}
	throw new Error("Failed to resolve plugin module. The entrypoint must export either definePlugin(...) or Plugin hooks.");
}
function createModuleIdentity(name, index) {
	const sanitizedName = name.trim() || "plugin";
	return {
		id: `${sanitizedName}-${index}`,
		kind: "plugin",
		plugin: { id: sanitizedName }
	};
}
function normalizeVersionList(versions) {
	return [...new Set(versions.map((version) => version.trim()).filter(Boolean))];
}
function resolveSupportedVersions(preferredVersion, supportedVersions) {
	return normalizeVersionList([preferredVersion, ...supportedVersions ?? []]);
}
function resolveNegotiatedVersion(preferredVersion, hostSupportedVersions, peerSupportedVersions) {
	const normalizedPreferredVersion = preferredVersion.trim();
	const normalizedHostSupportedVersions = normalizeVersionList(hostSupportedVersions);
	const normalizedPeerSupportedVersions = peerSupportedVersions && peerSupportedVersions.length > 0 ? normalizeVersionList(peerSupportedVersions) : void 0;
	if (!normalizedPeerSupportedVersions?.length) {
		if (normalizedHostSupportedVersions.includes(normalizedPreferredVersion)) return {
			acceptedVersion: normalizedPreferredVersion,
			exact: true
		};
		return {
			exact: false,
			reason: `Host does not support preferred version "${normalizedPreferredVersion}".`
		};
	}
	if (normalizedPeerSupportedVersions.includes(normalizedPreferredVersion) && normalizedHostSupportedVersions.includes(normalizedPreferredVersion)) return {
		acceptedVersion: normalizedPreferredVersion,
		exact: true
	};
	for (const version of normalizedHostSupportedVersions) if (normalizedPeerSupportedVersions.includes(version)) return {
		acceptedVersion: version,
		exact: false
	};
	return {
		exact: false,
		reason: `No overlapping supported versions. host=[${normalizedHostSupportedVersions.join(", ")}]; peer=[${normalizedPeerSupportedVersions.join(", ")}].`
	};
}
const manifestV1Schema = object({
	apiVersion: literal("v1"),
	kind: literal("manifest.plugin.airi.moeru.ai"),
	name: string(),
	entrypoints: object({
		default: optional(string()),
		electron: optional(string()),
		node: optional(string()),
		web: optional(string())
	})
});
/**
* In-memory Plugin Host MVP.
*
* Procedure placement:
* - `load(...)` covers step 0 and step 1 preparation:
*   - create channel gateway/context
*   - prepare per-plugin isolated runtime resources
*   - load plugin module from manifest entrypoint
* - `init(...)` covers protocol/lifecycle step 2 onwards:
*   - authentication
*   - compatibility negotiation
*   - registry sync + announce/prepare/configure/ready flow
*
* The design intentionally keeps `load` and `init` separate so callers can:
* - inspect/patch session state before booting,
* - batch-load many plugins first, then initialize deterministically.
*/
var PluginHost = class {
	loader;
	sessions = /* @__PURE__ */ new Map();
	runtime;
	transport;
	protocolVersion;
	apiVersion;
	supportedProtocolVersions;
	supportedApiVersions;
	capabilities = /* @__PURE__ */ new Map();
	capabilityWaiters = /* @__PURE__ */ new Map();
	providersListResolver = () => [];
	sessionCounter = 0;
	constructor(options = {}) {
		this.loader = new FileSystemLoader();
		this.runtime = options.runtime ?? "electron";
		this.transport = options.transport ?? { kind: "in-memory" };
		this.protocolVersion = options.protocolVersion ?? "v1";
		this.apiVersion = options.apiVersion ?? "v1";
		this.supportedProtocolVersions = resolveSupportedVersions(this.protocolVersion, options.supportedProtocolVersions);
		this.supportedApiVersions = resolveSupportedVersions(this.apiVersion, options.supportedApiVersions);
		this.markCapabilityReady(protocolListProvidersEventName, { source: "plugin-host" });
	}
	listSessions() {
		return [...this.sessions.values()];
	}
	getSession(sessionId) {
		return this.sessions.get(sessionId);
	}
	async load(manifest, options = {}) {
		const runtime = options.runtime ?? this.runtime;
		const sessionCwd = options.cwd ?? cwd();
		const transport = this.transport;
		if (transport.kind !== "in-memory") throw new Error(`Only in-memory transport is currently supported by PluginHost alpha. Got: ${transport.kind}`);
		const sessionIndex = this.sessionCounter;
		this.sessionCounter += 1;
		const id = `plugin-session-${sessionIndex}`;
		const identity = createModuleIdentity(manifest.name, sessionIndex);
		const hostChannel = createPluginContext(transport);
		const lifecycle = createActor(pluginLifecycleMachine);
		lifecycle.start();
		defineInvokeHandler(hostChannel, protocolCapabilityWait, async (payload) => {
			return await this.waitForCapability(payload.key, payload?.timeoutMs);
		});
		defineInvokeHandler(hostChannel, protocolCapabilitySnapshot, async () => {
			return this.listCapabilities();
		});
		defineInvokeHandler(hostChannel, protocolProviders.listProviders, async () => {
			return await this.providersListResolver();
		});
		const session = {
			manifest,
			plugin: {},
			id,
			index: sessionIndex,
			cwd: sessionCwd,
			identity,
			phase: lifecycle.getSnapshot().value,
			lifecycle,
			transport,
			runtime,
			channels: { host: hostChannel },
			apis: createApis(hostChannel)
		};
		this.sessions.set(id, session);
		try {
			session.plugin = await this.loader.loadPluginFor(manifest, {
				cwd: sessionCwd,
				runtime
			});
			assertTransition(session, "loaded");
			return session;
		} catch (error) {
			markFailedTransition(session);
			session.channels.host.emit(moduleStatus, {
				identity: session.identity,
				phase: "failed",
				reason: error instanceof Error ? error.message : "Failed to load plugin."
			});
			throw error;
		}
	}
	async init(sessionId, options = {}) {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Unable to initialize plugin session: ${sessionId}`);
		if (session.phase !== "loaded") throw new Error(`Session ${sessionId} cannot initialize from phase ${session.phase}. Expected loaded.`);
		try {
			let preparedEmitted = false;
			assertTransition(session, "authenticating");
			session.channels.host.emit(moduleAuthenticate, { token: `${session.id}:${session.identity.id}` });
			assertTransition(session, "authenticated");
			session.channels.host.emit(moduleAuthenticated, { authenticated: true });
			const compatibilityRequest = {
				protocolVersion: this.protocolVersion,
				apiVersion: this.apiVersion,
				supportedProtocolVersions: options.compatibility?.supportedProtocolVersions,
				supportedApiVersions: options.compatibility?.supportedApiVersions
			};
			session.channels.host.emit(moduleCompatibilityRequest, compatibilityRequest);
			const protocolNegotiation = resolveNegotiatedVersion(compatibilityRequest.protocolVersion, this.supportedProtocolVersions, compatibilityRequest.supportedProtocolVersions);
			const apiNegotiation = resolveNegotiatedVersion(compatibilityRequest.apiVersion, this.supportedApiVersions, compatibilityRequest.supportedApiVersions);
			const rejectionReasons = [...protocolNegotiation.acceptedVersion ? [] : [`protocol: ${protocolNegotiation.reason}`], ...apiNegotiation.acceptedVersion ? [] : [`api: ${apiNegotiation.reason}`]];
			if (rejectionReasons.length > 0) {
				const reason = `Negotiation rejected: ${rejectionReasons.join("; ")}`;
				session.channels.host.emit(moduleCompatibilityResult, {
					protocolVersion: compatibilityRequest.protocolVersion,
					apiVersion: compatibilityRequest.apiVersion,
					mode: "rejected",
					reason
				});
				throw new Error(reason);
			}
			session.channels.host.emit(moduleCompatibilityResult, {
				protocolVersion: protocolNegotiation.acceptedVersion,
				apiVersion: apiNegotiation.acceptedVersion,
				mode: protocolNegotiation.exact && apiNegotiation.exact ? "exact" : "downgraded"
			});
			session.channels.host.emit(registryModulesSync, { modules: this.listSessions().filter((item) => item.phase !== "stopped").map((item) => ({
				name: item.manifest.name,
				index: item.index,
				identity: item.identity
			})) });
			assertTransition(session, "announced");
			session.channels.host.emit(moduleAnnounce, {
				name: session.manifest.name,
				identity: session.identity,
				possibleEvents: []
			});
			session.channels.host.emit(moduleStatus, {
				identity: session.identity,
				phase: "announced"
			});
			assertTransition(session, "preparing");
			session.channels.host.emit(moduleStatus, {
				identity: session.identity,
				phase: "preparing"
			});
			if (options.requiredCapabilities?.length) {
				const capabilityTimeoutMs = options.capabilityWaitTimeoutMs ?? 15e3;
				const unresolvedCapabilities = options.requiredCapabilities.filter((key) => !this.isCapabilityReady(key));
				assertTransition(session, "waiting-deps");
				session.channels.host.emit(moduleStatus, {
					identity: session.identity,
					phase: "preparing",
					reason: `Waiting for capabilities: ${options.requiredCapabilities.join(", ")}`,
					details: {
						lifecyclePhase: "waiting-deps",
						requiredCapabilities: options.requiredCapabilities,
						unresolvedCapabilities,
						timeoutMs: capabilityTimeoutMs
					}
				});
				await this.waitForCapabilities(options.requiredCapabilities, capabilityTimeoutMs);
				assertTransition(session, "prepared");
				session.channels.host.emit(modulePrepared, { identity: session.identity });
				session.channels.host.emit(moduleStatus, {
					identity: session.identity,
					phase: "prepared"
				});
				preparedEmitted = true;
			}
			if (await session.plugin.init?.({
				channels: session.channels,
				apis: session.apis
			}) === false) throw new Error(`Plugin initialization aborted by plugin: ${session.manifest.name}`);
			if (!preparedEmitted) {
				assertTransition(session, "prepared");
				session.channels.host.emit(modulePrepared, { identity: session.identity });
				session.channels.host.emit(moduleStatus, {
					identity: session.identity,
					phase: "prepared"
				});
			}
			if (options.requireConfiguration) {
				assertTransition(session, "configuration-needed");
				session.channels.host.emit(moduleConfigurationNeeded, {
					identity: session.identity,
					reason: "Host requested configuration before activation."
				});
				session.channels.host.emit(moduleStatus, {
					identity: session.identity,
					phase: "configuration-needed"
				});
				return session;
			}
			await this.applyConfiguration(session.id, {
				configId: `${session.identity.id}:default`,
				revision: 1,
				schemaVersion: 1,
				full: {}
			});
			await session.plugin.setupModules?.({
				channels: session.channels,
				apis: session.apis
			});
			assertTransition(session, "ready");
			session.channels.host.emit(moduleStatus, {
				identity: session.identity,
				phase: "ready"
			});
			return session;
		} catch (error) {
			markFailedTransition(session);
			session.channels.host.emit(moduleStatus, {
				identity: session.identity,
				phase: "failed",
				reason: error instanceof Error ? error.message : "Plugin host initialization failed."
			});
			throw error;
		}
	}
	async start(manifest, options = {}) {
		const session = await this.load(manifest, {
			cwd: options.cwd,
			runtime: options.runtime
		});
		return this.init(session.id, options);
	}
	async applyConfiguration(sessionId, config) {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Unable to configure plugin session: ${sessionId}`);
		if (![
			"prepared",
			"configuration-needed",
			"configured"
		].includes(session.phase)) throw new Error(`Session ${sessionId} cannot accept configuration during phase ${session.phase}.`);
		if (session.phase !== "configured") assertTransition(session, "configured");
		session.channels.host.emit(moduleConfigurationConfigured, {
			identity: session.identity,
			config
		});
		session.channels.host.emit(moduleStatus, {
			identity: session.identity,
			phase: "configured"
		});
		return session;
	}
	setProvidersListResolver(resolver) {
		this.providersListResolver = resolver;
		this.markCapabilityReady(protocolListProvidersEventName, { source: "plugin-host-override" });
	}
	announceCapability(key, metadata) {
		const current = this.capabilities.get(key);
		const descriptor = {
			key,
			state: "announced",
			metadata: metadata ?? current?.metadata,
			updatedAt: Date.now()
		};
		this.capabilities.set(key, descriptor);
		return descriptor;
	}
	markCapabilityReady(key, metadata) {
		const current = this.capabilities.get(key);
		const descriptor = {
			key,
			state: "ready",
			metadata: metadata ?? current?.metadata,
			updatedAt: Date.now()
		};
		this.capabilities.set(key, descriptor);
		const waiters = this.capabilityWaiters.get(key);
		if (waiters) {
			for (const resolve of waiters) resolve(descriptor);
			this.capabilityWaiters.delete(key);
		}
		return descriptor;
	}
	markCapabilityDegraded(key, metadata) {
		const current = this.capabilities.get(key);
		const descriptor = {
			key,
			state: "degraded",
			metadata: metadata ?? current?.metadata,
			updatedAt: Date.now()
		};
		this.capabilities.set(key, descriptor);
		return descriptor;
	}
	withdrawCapability(key, metadata) {
		const current = this.capabilities.get(key);
		const descriptor = {
			key,
			state: "withdrawn",
			metadata: metadata ?? current?.metadata,
			updatedAt: Date.now()
		};
		this.capabilities.set(key, descriptor);
		return descriptor;
	}
	listCapabilities() {
		return [...this.capabilities.values()];
	}
	isCapabilityReady(key) {
		return this.capabilities.get(key)?.state === "ready";
	}
	async waitForCapabilities(keys, timeoutMs = 15e3) {
		await Promise.all(keys.map(async (key) => await this.waitForCapability(key, timeoutMs)));
	}
	async waitForCapability(key, timeoutMs = 15e3) {
		const existing = this.capabilities.get(key);
		if (existing?.state === "ready") return existing;
		return await new Promise((resolve, reject) => {
			let timeout;
			const onReady = (descriptor) => {
				if (timeout) clearTimeout(timeout);
				resolve(descriptor);
			};
			const waiters = this.capabilityWaiters.get(key) ?? /* @__PURE__ */ new Set();
			waiters.add(onReady);
			this.capabilityWaiters.set(key, waiters);
			timeout = setTimeout(() => {
				const currentWaiters = this.capabilityWaiters.get(key);
				currentWaiters?.delete(onReady);
				if (currentWaiters && currentWaiters.size === 0) this.capabilityWaiters.delete(key);
				reject(/* @__PURE__ */ new Error(`Capability \`${key}\` is not ready after ${timeoutMs}ms.`));
			}, timeoutMs);
		});
	}
	markConfigurationNeeded(sessionId, reason) {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Unable to update plugin session: ${sessionId}`);
		if (![
			"prepared",
			"configured",
			"ready",
			"announced"
		].includes(session.phase)) throw new Error(`Session ${sessionId} cannot move to configuration-needed from ${session.phase}.`);
		assertTransition(session, "configuration-needed");
		session.channels.host.emit(moduleConfigurationNeeded, {
			identity: session.identity,
			reason
		});
		session.channels.host.emit(moduleStatus, {
			identity: session.identity,
			phase: "configuration-needed",
			reason
		});
		return session;
	}
	stop(sessionId) {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		if (session.phase !== "stopped") if (session.lifecycle.getSnapshot().can({ type: "STOP" })) assertTransition(session, "stopped");
		else session.phase = "stopped";
		session.lifecycle.stop();
		this.sessions.delete(session.id);
		return session;
	}
	async reload(sessionId, options = {}) {
		const previous = this.sessions.get(sessionId);
		if (!previous) throw new Error(`Unable to reload missing plugin session: ${sessionId}`);
		const manifest = previous.manifest;
		this.stop(sessionId);
		return this.start(manifest, {
			...options,
			cwd: options.cwd ?? previous.cwd,
			runtime: options.runtime ?? previous.runtime
		});
	}
};
var FileSystemLoader = class {
	/**
	* Filesystem-backed plugin module loader.
	*
	* Responsibilities:
	* - Resolve runtime-specific entrypoints from `ManifestV1`.
	* - Import plugin modules from local disk.
	* - Normalize module exports into either:
	*   - lazy plugin definition (`definePlugin(...)`) via `loadLazyPluginFor`, or
	*   - executable plugin hooks (`Plugin`) via `loadPluginFor`.
	*/
	constructor() {}
	/**
	* Resolve a manifest entrypoint for the requested runtime.
	*
	* Resolution order:
	* 1) `entrypoints.<runtime>`
	* 2) `entrypoints.default`
	* 3) `entrypoints.electron` (legacy fallback for current local plugin manifests)
	*
	* Throws an actionable error when no entrypoint can be selected.
	*/
	resolveEntrypointFor(manifest, options) {
		const runtime = options?.runtime ?? "electron";
		const root = options?.cwd ?? cwd();
		const entrypoint = manifest.entrypoints[runtime] ?? manifest.entrypoints.default ?? manifest.entrypoints.electron;
		if (!entrypoint) throw new Error(`Plugin entrypoint is required for runtime \`${runtime}\`. Define one of \`entrypoints.<runtime>\`, \`entrypoints.default\`, or \`entrypoints.electron\` in the plugin manifest.`);
		return isAbsolute(entrypoint) ? entrypoint : join(root, entrypoint);
	}
	/**
	* Load a lazy plugin definition (`definePlugin(...)`) without executing setup.
	*
	* Use this when host logic wants to inspect plugin metadata/setup contract first
	* and control when `setup()` is called.
	*/
	async loadLazyPluginFor(manifest, options) {
		const pluginModule = await import(this.resolveEntrypointFor(manifest, options));
		if (isPluginDefinition(pluginModule)) return pluginModule;
		if (typeof pluginModule === "object" && pluginModule !== null) {
			const defaultExport = pluginModule.default;
			if (isPluginDefinition(defaultExport)) return defaultExport;
		}
		throw new Error("Plugin lazy loader expects a definePlugin(...) export.");
	}
	/**
	* Load and normalize a plugin entrypoint into executable `Plugin` hooks.
	*
	* Accepts:
	* - a direct `Plugin` export
	* - a default `Plugin` export
	* - `definePlugin(...)` (calls `setup()` and returns the resulting `Plugin`)
	*/
	async loadPluginFor(manifest, options) {
		return coercePluginFromModule(await import(this.resolveEntrypointFor(manifest, options)));
	}
};

//#endregion
export { PluginHost as n, manifestV1Schema as r, FileSystemLoader as t };