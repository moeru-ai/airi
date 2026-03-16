import WebSocket from "crossws/websocket";
import superjson from "superjson";
import { ContextUpdateStrategy, MessageHeartbeat, MessageHeartbeatKind, WebSocketEventSource } from "@proj-airi/server-shared/types";

//#region ../../node_modules/.pnpm/@moeru+std@0.1.0-beta.17/node_modules/@moeru/std/dist/sleep/index.js
const sleep = async (delay) => new Promise((resolve) => setTimeout(resolve, delay));

//#endregion
//#region src/client.ts
function createInstanceId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function createEventId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
var Client = class {
	connected = false;
	connecting = false;
	websocket;
	shouldClose = false;
	connectAttempt;
	connectTask;
	heartbeatTimer;
	identity;
	opts;
	eventListeners = /* @__PURE__ */ new Map();
	constructor(options) {
		const identity = options.identity ?? {
			kind: "plugin",
			plugin: { id: options.name },
			id: createInstanceId()
		};
		this.opts = {
			url: "ws://localhost:6121/ws",
			onAnyMessage: () => {},
			onAnySend: () => {},
			possibleEvents: [],
			dependencies: [],
			configSchema: void 0,
			onError: () => {},
			onClose: () => {},
			autoConnect: true,
			autoReconnect: true,
			maxReconnectAttempts: -1,
			heartbeat: {
				readTimeout: 3e4,
				message: MessageHeartbeat.Ping
			},
			...options,
			identity
		};
		this.identity = identity;
		this.onEvent("module:authenticated", async (event) => {
			if (event.data.authenticated) this.tryAnnounce();
			else await this.retryWithExponentialBackoff(() => this.tryAuthenticate());
		});
		this.onEvent("error", async (event) => {
			if (event.data.message === "not authenticated") await this._reconnectDueToUnauthorized();
		});
		this.onEvent("transport:connection:heartbeat", (event) => {
			if (event.data.kind === MessageHeartbeatKind.Ping) this.sendHeartbeatPong();
		});
		if (this.opts.autoConnect) this.connect();
	}
	async retryWithExponentialBackoff(fn) {
		const { maxReconnectAttempts } = this.opts;
		let attempts = 0;
		while (true) {
			if (maxReconnectAttempts !== -1 && attempts >= maxReconnectAttempts) {
				console.error(`Maximum retry attempts (${maxReconnectAttempts}) reached`);
				return;
			}
			try {
				await fn();
				return;
			} catch (err) {
				this.opts.onError?.(err);
				await sleep(Math.min(2 ** attempts * 1e3, 3e4));
				attempts++;
			}
		}
	}
	async tryReconnectWithExponentialBackoff() {
		if (this.shouldClose) throw new Error("Client is closed");
		await this.retryWithExponentialBackoff(() => this._connect());
	}
	_connect() {
		if (this.shouldClose || this.connected) return Promise.resolve();
		if (this.connecting) return this.connectAttempt ?? Promise.resolve();
		this.connectAttempt = new Promise((resolve, reject) => {
			this.connecting = true;
			let settled = false;
			const settle = (fn) => {
				if (settled) return;
				settled = true;
				this.connecting = false;
				this.connectAttempt = void 0;
				fn();
			};
			const ws = new WebSocket(this.opts.url);
			this.websocket = ws;
			const isCurrentSocket = () => this.websocket === ws;
			ws.onmessage = (event) => {
				if (!isCurrentSocket()) return;
				this.handleMessageBound(event);
			};
			ws.onerror = (event) => {
				if (!isCurrentSocket()) return;
				settle(() => {
					this.websocket = void 0;
					this.connected = false;
					this.opts.onError?.(event);
					reject(event?.error ?? /* @__PURE__ */ new Error("WebSocket error"));
				});
			};
			ws.onclose = () => {
				if (!isCurrentSocket()) return;
				this.websocket = void 0;
				if (!settled && !this.connected) {
					settle(() => {
						reject(/* @__PURE__ */ new Error("WebSocket closed before open"));
					});
					return;
				}
				if (this.connected) {
					this.connected = false;
					this.stopHeartbeat();
					this.opts.onClose?.();
				}
				if (this.opts.autoReconnect && !this.shouldClose) this.tryReconnectWithExponentialBackoff();
			};
			ws.onopen = () => {
				if (!isCurrentSocket()) return;
				settle(() => {
					this.connected = true;
					this.startHeartbeat();
					if (this.opts.token) this.tryAuthenticate();
					else this.tryAnnounce();
					resolve();
				});
			};
		});
		return this.connectAttempt;
	}
	async connect() {
		if (this.connected) return;
		if (this.connectTask) return this.connectTask;
		this.connectTask = this.tryReconnectWithExponentialBackoff().finally(() => this.connectTask = void 0);
		return this.connectTask;
	}
	tryAnnounce() {
		this.send({
			type: "module:announce",
			data: {
				name: this.opts.name,
				identity: this.identity,
				possibleEvents: this.opts.possibleEvents,
				dependencies: this.opts.dependencies,
				configSchema: this.opts.configSchema
			}
		});
	}
	tryAuthenticate() {
		if (this.opts.token) this.send({
			type: "module:authenticate",
			data: { token: this.opts.token }
		});
	}
	handleMessageBound = (event) => {
		this.handleMessage(event);
	};
	async handleMessage(event) {
		try {
			const raw = event.data;
			const parsed = superjson.parse(raw);
			const data = parsed && typeof parsed === "object" && "type" in parsed ? parsed : JSON.parse(raw);
			if (!data || typeof data !== "object" || !("type" in data)) {
				console.warn("Received empty message");
				return;
			}
			this.opts.onAnyMessage?.(data);
			const listeners = this.eventListeners.get(data.type);
			if (!listeners?.size) return;
			const executions = [];
			for (const listener of listeners) executions.push(Promise.resolve(listener(data)));
			await Promise.allSettled(executions);
		} catch (err) {
			console.error("Failed to parse message:", err);
			this.opts.onError?.(err);
		}
	}
	onEvent(event, callback) {
		let listeners = this.eventListeners.get(event);
		if (!listeners) {
			listeners = /* @__PURE__ */ new Set();
			this.eventListeners.set(event, listeners);
		}
		listeners.add(callback);
	}
	offEvent(event, callback) {
		const listeners = this.eventListeners.get(event);
		if (!listeners) return;
		if (callback) {
			listeners.delete(callback);
			if (!listeners.size) this.eventListeners.delete(event);
		} else this.eventListeners.delete(event);
	}
	send(data) {
		if (this.websocket && this.connected) {
			const payload = {
				...data,
				metadata: {
					...data?.metadata,
					source: data?.metadata?.source ?? this.identity,
					event: {
						id: data?.metadata?.event?.id ?? createEventId(),
						...data?.metadata?.event
					}
				}
			};
			this.opts.onAnySend?.(payload);
			this.websocket.send(superjson.stringify(payload));
		}
	}
	sendRaw(data) {
		if (this.websocket && this.connected) this.websocket.send(data);
	}
	close() {
		this.shouldClose = true;
		this.stopHeartbeat();
		const websocket = this.websocket;
		this.websocket = void 0;
		if (websocket) {
			websocket.close();
			this.connected = false;
		}
	}
	startHeartbeat() {
		if (!this.opts.heartbeat?.readTimeout) return;
		this.stopHeartbeat();
		const ping = () => this.sendHeartbeatPing();
		ping();
		this.heartbeatTimer = setInterval(ping, this.opts.heartbeat.readTimeout);
	}
	stopHeartbeat() {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = void 0;
		}
	}
	sendNativeHeartbeat(kind) {
		const websocket = this.websocket;
		if (kind === "ping") websocket.ping?.();
		else websocket.pong?.();
	}
	sendHeartbeatPing() {
		this.send({
			type: "transport:connection:heartbeat",
			data: {
				kind: MessageHeartbeatKind.Ping,
				message: this.opts.heartbeat?.message ?? MessageHeartbeat.Ping,
				at: Date.now()
			}
		});
		this.sendNativeHeartbeat("ping");
	}
	sendHeartbeatPong() {
		this.send({
			type: "transport:connection:heartbeat",
			data: {
				kind: MessageHeartbeatKind.Pong,
				message: MessageHeartbeat.Pong,
				at: Date.now()
			}
		});
		this.sendNativeHeartbeat("pong");
	}
	async _reconnectDueToUnauthorized() {
		if (this.shouldClose) return;
		const ws = this.websocket;
		this.connected = false;
		this.websocket = void 0;
		if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close();
		await this.connect();
	}
};

//#endregion
export { Client, ContextUpdateStrategy, WebSocketEventSource };
//# sourceMappingURL=index.mjs.map