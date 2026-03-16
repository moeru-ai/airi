import { a as matchesDestinations, i as isDevtoolsPeer, n as collectDestinations, o as optionOrEnv, r as createPolicyMiddleware, s as version, t as createAnycastMiddleware } from "./anycast-HDRhgpyA.mjs";
import { Format, LogLevelString, availableLogLevelStrings, logLevelStringToLogLevelMap, useLogg } from "@guiiai/logg";
import { MessageHeartbeat, MessageHeartbeatKind, WebSocketEventSource } from "@proj-airi/server-shared/types";
import { H3, defineWebSocketHandler } from "h3";
import { nanoid } from "nanoid";
import { parse, stringify } from "superjson";

//#region src/index.ts
function createServerEventMetadata(serverInstanceId, parentId) {
	return {
		event: {
			id: nanoid(),
			parentId
		},
		source: {
			kind: "plugin",
			plugin: {
				id: WebSocketEventSource.Server,
				version
			},
			id: serverInstanceId
		}
	};
}
const RESPONSES = {
	authenticated: (serverInstanceId, parentId) => ({
		type: "module:authenticated",
		data: { authenticated: true },
		metadata: createServerEventMetadata(serverInstanceId, parentId)
	}),
	notAuthenticated: (serverInstanceId, parentId) => ({
		type: "error",
		data: { message: "not authenticated" },
		metadata: createServerEventMetadata(serverInstanceId, parentId)
	}),
	error: (message, serverInstanceId, parentId) => ({
		type: "error",
		data: { message },
		metadata: createServerEventMetadata(serverInstanceId, parentId)
	}),
	heartbeat: (kind, message, serverInstanceId, parentId) => ({
		type: "transport:connection:heartbeat",
		data: {
			kind,
			message,
			at: Date.now()
		},
		metadata: createServerEventMetadata(serverInstanceId, parentId)
	})
};
const DEFAULT_HEARTBEAT_TTL_MS = 6e4;
function send(peer, event) {
	peer.send(typeof event === "string" ? event : stringify(event));
}
function normalizeLoggerConfig(options) {
	const appLogLevel = optionOrEnv(options?.logger?.app?.level, "LOG_LEVEL", LogLevelString.Log, { validator: (value) => availableLogLevelStrings.includes(value) });
	const appLogFormat = optionOrEnv(options?.logger?.app?.format, "LOG_FORMAT", Format.Pretty, { validator: (value) => Object.values(Format).includes(value) });
	return {
		appLogLevel,
		appLogFormat,
		websocketLogLevel: options?.logger?.websocket?.level || appLogLevel || LogLevelString.Log,
		websocketLogFormat: options?.logger?.websocket?.format || appLogFormat || Format.Pretty
	};
}
function setupApp(options) {
	const instanceId = options?.instanceId || optionOrEnv(void 0, "SERVER_INSTANCE_ID", nanoid());
	const authToken = optionOrEnv(options?.auth?.token, "AUTHENTICATION_TOKEN", "");
	const { appLogLevel, appLogFormat, websocketLogLevel, websocketLogFormat } = normalizeLoggerConfig(options);
	const appLogger = useLogg("@proj-airi/server-runtime").withLogLevel(logLevelStringToLogLevelMap[appLogLevel]).withFormat(appLogFormat);
	const logger = useLogg("@proj-airi/server-runtime:websocket").withLogLevel(logLevelStringToLogLevelMap[websocketLogLevel]).withFormat(websocketLogFormat);
	const app = new H3({ onError: (error) => appLogger.withError(error).error("an error occurred") });
	const peers = /* @__PURE__ */ new Map();
	const peersByModule = /* @__PURE__ */ new Map();
	const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? DEFAULT_HEARTBEAT_TTL_MS;
	const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong;
	const routingMiddleware = [
		createAnycastMiddleware(),
		...options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : [],
		...options?.routing?.middleware ?? []
	];
	const HEALTH_CHECK_MISSES_UNHEALTHY = 5;
	const HEALTH_CHECK_MISSES_DEAD = HEALTH_CHECK_MISSES_UNHEALTHY * 2;
	const healthCheckIntervalMs = Math.max(5e3, Math.floor(heartbeatTtlMs / HEALTH_CHECK_MISSES_UNHEALTHY));
	setInterval(() => {
		const now = Date.now();
		for (const [id, peerInfo] of peers.entries()) {
			if (!peerInfo.lastHeartbeatAt) continue;
			if (now - peerInfo.lastHeartbeatAt > healthCheckIntervalMs) peerInfo.missedHeartbeats = (peerInfo.missedHeartbeats ?? 0) + 1;
			else peerInfo.missedHeartbeats = 0;
			if (peerInfo.missedHeartbeats >= HEALTH_CHECK_MISSES_DEAD) {
				logger.withFields({
					peer: id,
					peerName: peerInfo.name,
					missedHeartbeats: peerInfo.missedHeartbeats
				}).debug("heartbeat expired after max misses, dropping peer");
				try {
					peerInfo.peer.close?.();
				} catch (error) {
					logger.withFields({
						peer: id,
						peerName: peerInfo.name
					}).withError(error).debug("failed to close expired peer");
				}
				peers.delete(id);
				unregisterModulePeer(peerInfo, "heartbeat expired");
			} else if (peerInfo.missedHeartbeats >= HEALTH_CHECK_MISSES_UNHEALTHY && peerInfo.healthy !== false && peerInfo.name && peerInfo.identity) {
				peerInfo.healthy = false;
				logger.withFields({
					peer: id,
					peerName: peerInfo.name,
					missedHeartbeats: peerInfo.missedHeartbeats
				}).debug("heartbeat late, marking unhealthy");
				broadcastToAuthenticated({
					type: "registry:modules:health:unhealthy",
					data: {
						name: peerInfo.name,
						index: peerInfo.index,
						identity: peerInfo.identity,
						reason: "heartbeat late"
					},
					metadata: createServerEventMetadata(instanceId)
				});
			}
		}
	}, healthCheckIntervalMs);
	function registerModulePeer(p, name, index) {
		if (!peersByModule.has(name)) peersByModule.set(name, /* @__PURE__ */ new Map());
		const group = peersByModule.get(name);
		if (group.has(index)) logger.withFields({
			name,
			index
		}).debug("peer replaced for module");
		p.healthy = true;
		group.set(index, p);
		broadcastRegistrySync();
	}
	function unregisterModulePeer(p, reason) {
		if (!p.name) return;
		const group = peersByModule.get(p.name);
		if (group) {
			group.delete(p.index);
			if (group.size === 0) peersByModule.delete(p.name);
		}
		if (p.identity) broadcastToAuthenticated({
			type: "module:de-announced",
			data: {
				name: p.name,
				index: p.index,
				identity: p.identity,
				reason
			},
			metadata: createServerEventMetadata(instanceId)
		});
		broadcastRegistrySync();
	}
	function listKnownModules() {
		return Array.from(peers.values()).filter((peerInfo) => peerInfo.name && peerInfo.identity).map((peerInfo) => ({
			name: peerInfo.name,
			index: peerInfo.index,
			identity: peerInfo.identity
		}));
	}
	function sendRegistrySync(peer, parentId) {
		send(peer, {
			type: "registry:modules:sync",
			data: { modules: listKnownModules() },
			metadata: createServerEventMetadata(instanceId, parentId)
		});
	}
	function broadcastRegistrySync() {
		for (const p of peers.values()) if (p.authenticated) sendRegistrySync(p.peer);
	}
	function broadcastToAuthenticated(event) {
		for (const p of peers.values()) if (p.authenticated) send(p.peer, event);
	}
	app.get("/ws", defineWebSocketHandler({
		open: (peer) => {
			if (authToken) peers.set(peer.id, {
				peer,
				authenticated: false,
				name: "",
				lastHeartbeatAt: Date.now()
			});
			else {
				send(peer, RESPONSES.authenticated(instanceId));
				peers.set(peer.id, {
					peer,
					authenticated: true,
					name: "",
					lastHeartbeatAt: Date.now()
				});
				sendRegistrySync(peer);
			}
			logger.withFields({
				peer: peer.id,
				activePeers: peers.size
			}).log("connected");
		},
		message: (peer, message) => {
			const authenticatedPeer = peers.get(peer.id);
			let event;
			try {
				const text = message.text();
				const parsed = parse(text);
				const potentialEvent = parsed && typeof parsed === "object" && "type" in parsed ? parsed : JSON.parse(text);
				if (!potentialEvent || typeof potentialEvent !== "object" || !("type" in potentialEvent)) {
					send(peer, RESPONSES.error("invalid event format", instanceId));
					return;
				}
				event = potentialEvent;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				send(peer, RESPONSES.error(`invalid JSON, error: ${errorMessage}`, instanceId));
				return;
			}
			logger.withFields({
				peer: peer.id,
				peerAuthenticated: authenticatedPeer?.authenticated,
				peerModule: authenticatedPeer?.name,
				peerModuleIndex: authenticatedPeer?.index
			}).debug("received event");
			if (authenticatedPeer) {
				authenticatedPeer.lastHeartbeatAt = Date.now();
				if (event.metadata?.source) authenticatedPeer.identity = event.metadata.source;
			}
			switch (event.type) {
				case "transport:connection:heartbeat": {
					const p = peers.get(peer.id);
					if (p) {
						p.lastHeartbeatAt = Date.now();
						p.missedHeartbeats = 0;
						if (p.healthy === false && p.name && p.identity) {
							p.healthy = true;
							logger.withFields({
								peer: peer.id,
								peerName: p.name
							}).debug("heartbeat recovered, marking healthy");
							broadcastToAuthenticated({
								type: "registry:modules:health:healthy",
								data: {
									name: p.name,
									index: p.index,
									identity: p.identity
								},
								metadata: createServerEventMetadata(instanceId, event.metadata?.event.id)
							});
						}
					}
					if (event.data.kind === MessageHeartbeatKind.Ping) send(peer, RESPONSES.heartbeat(MessageHeartbeatKind.Pong, heartbeatMessage, instanceId, event.metadata?.event.id));
					return;
				}
				case "module:authenticate": {
					if (authToken && event.data.token !== authToken) {
						logger.withFields({
							peer: peer.id,
							peerRemote: peer.remoteAddress,
							peerRequest: peer.request.url
						}).log("authentication failed");
						send(peer, RESPONSES.error("invalid token", instanceId, event.metadata?.event.id));
						return;
					}
					send(peer, RESPONSES.authenticated(instanceId, event.metadata?.event.id));
					const p = peers.get(peer.id);
					if (p) p.authenticated = true;
					sendRegistrySync(peer, event.metadata?.event.id);
					return;
				}
				case "module:announce": {
					const p = peers.get(peer.id);
					if (!p) return;
					unregisterModulePeer(p, "re-announcing");
					const { name, index, identity } = event.data;
					if (!name || typeof name !== "string") {
						send(peer, RESPONSES.error("the field 'name' must be a non-empty string for event 'module:announce'", instanceId));
						return;
					}
					if (typeof index !== "undefined") {
						if (!Number.isInteger(index) || index < 0) {
							send(peer, RESPONSES.error("the field 'index' must be a non-negative integer for event 'module:announce'", instanceId));
							return;
						}
					}
					if (!identity || identity.kind !== "plugin" || !identity.plugin?.id) {
						send(peer, RESPONSES.error("module identity must include kind=plugin and a plugin id for event 'module:announce'", instanceId));
						return;
					}
					if (authToken && !p.authenticated) {
						send(peer, RESPONSES.error("must authenticate before announcing", instanceId));
						return;
					}
					p.name = name;
					p.index = index;
					if (identity) p.identity = identity;
					registerModulePeer(p, name, index);
					for (const other of peers.values()) if (other.authenticated) send(other.peer, {
						type: "module:announced",
						data: {
							name,
							index,
							identity
						},
						metadata: createServerEventMetadata(instanceId, event.metadata?.event.id)
					});
					return;
				}
				case "ui:configure": {
					const data = event.data;
					const moduleName = data.moduleName ?? data.identity?.plugin?.id ?? "";
					const moduleIndex = data.moduleIndex;
					const config = data.config;
					if (moduleName === "") {
						send(peer, RESPONSES.error("the field 'moduleName' can't be empty for event 'ui:configure'", instanceId));
						return;
					}
					if (typeof moduleIndex !== "undefined") {
						if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
							send(peer, RESPONSES.error("the field 'moduleIndex' must be a non-negative integer for event 'ui:configure'", instanceId));
							return;
						}
					}
					const target = peersByModule.get(moduleName)?.get(moduleIndex);
					if (target) send(target.peer, {
						type: "module:configure",
						data: { config },
						metadata: event.metadata
					});
					else send(peer, RESPONSES.error("module not found, it hasn't announced itself or the name is incorrect", instanceId));
					return;
				}
			}
			const p = peers.get(peer.id);
			if (!p?.authenticated) {
				logger.withFields({
					peer: peer.id,
					peerName: p?.name,
					peerRemote: peer.remoteAddress,
					peerRequest: peer.request.url
				}).debug("not authenticated");
				send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event.id));
				return;
			}
			const payload = stringify(event);
			const allowBypass = options?.routing?.allowBypass !== false;
			const destinations = Boolean(event.route?.bypass && allowBypass && isDevtoolsPeer(p)) ? void 0 : collectDestinations(event);
			const routingContext = {
				event,
				fromPeer: p,
				peers,
				destinations
			};
			let decision;
			for (const middleware of routingMiddleware) {
				const result = middleware(routingContext);
				if (result) {
					decision = result;
					break;
				}
			}
			if (decision?.type === "drop") {
				logger.withFields({
					peer: peer.id,
					peerName: p.name,
					event
				}).debug("routing dropped event");
				return;
			}
			const targetIds = decision?.type === "targets" ? decision.targetIds : void 0;
			const shouldBroadcast = decision?.type === "broadcast" || !targetIds;
			logger.withFields({
				peer: peer.id,
				peerName: p.name,
				event
			}).debug("broadcasting event to peers");
			for (const [id, other] of peers.entries()) {
				if (id === peer.id) {
					logger.withFields({
						peer: peer.id,
						peerName: p.name,
						event
					}).debug("not sending event to self");
					continue;
				}
				if (!shouldBroadcast && targetIds && !targetIds.has(id)) continue;
				if (shouldBroadcast && destinations && destinations.length > 0 && !matchesDestinations(destinations, other)) continue;
				try {
					logger.withFields({
						fromPeer: peer.id,
						fromPeerName: p.name,
						toPeer: other.peer.id,
						toPeerName: other.name,
						event
					}).debug("sending event to peer");
					other.peer.send(payload);
				} catch (err) {
					logger.withFields({
						fromPeer: peer.id,
						fromPeerName: p.name,
						toPeer: other.peer.id,
						toPeerName: other.name,
						event
					}).withError(err).error("failed to send event to peer, removing peer");
					logger.withFields({
						peer: peer.id,
						peerName: other.name
					}).debug("removing closed peer");
					peers.delete(id);
					unregisterModulePeer(other, "send failed");
				}
			}
		},
		error: (peer, error) => {
			logger.withFields({ peer: peer.id }).withError(error).error("an error occurred");
		},
		close: (peer, details) => {
			const p = peers.get(peer.id);
			if (p) unregisterModulePeer(p, "connection closed");
			logger.withFields({
				peer: peer.id,
				peerRemote: peer.remoteAddress,
				details,
				activePeers: peers.size
			}).log("closed");
			peers.delete(peer.id);
		}
	}));
	function closeAllPeers() {
		logger.withFields({ totalPeers: peers.size }).log("closing all peers");
		for (const peer of peers.values()) {
			logger.withFields({
				peer: peer.peer.id,
				peerName: peer.name
			}).debug("closing peer");
			peer.peer.close?.();
		}
	}
	return {
		app,
		closeAllPeers
	};
}
const { app, closeAllPeers: _ } = setupApp();

//#endregion
export { _, app, normalizeLoggerConfig, setupApp };