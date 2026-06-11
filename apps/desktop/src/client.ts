/**
 * AIRI Desktop — IPC Client
 *
 * Connects to the daemon via IPC, subscribes to the event stream,
 * and handles reconnection when the daemon restarts.
 *
 * This is a STUB — just the connection/reconnection logic, no UI.
 */

import type { IpcMessage, IpcEventMessage } from "../../../core/ipc/protocol.js"
import type { IpcConnectionState } from "../../../core/ipc/transport.js"
import { LocalSocketClientTransport } from "../../../core/ipc/local-socket/client.js"
import { request } from "../../../core/ipc/transport.js"
import { createLogger } from "../../../core/logger.js"

const logger = createLogger("desktop")

// ── Types ──────────────────────────────────────────────────────────────

export interface DesktopClientOptions {
	/** Socket path or TCP address. */
	socketPath?: string

	/** Auto-reconnect on disconnect. @default true */
	autoReconnect?: boolean
}

export interface DesktopClient {
	/** Connect to the daemon. */
	connect(): Promise<void>

	/** Disconnect from the daemon. */
	disconnect(): Promise<void>

	/** Current connection state. */
	readonly state: IpcConnectionState

	/** Subscribe to events from the daemon. */
	onEvent(handler: (event: IpcEventMessage) => void): () => void

	/** Subscribe to connection state changes. */
	onStateChange(handler: (state: IpcConnectionState) => void): () => void

	/** Send a request to the daemon. */
	request(method: string, params?: Record<string, unknown>): Promise<unknown>
}

// ── Implementation ────────────────────────────────────────────────────

/**
 * Create a desktop client that connects to the daemon.
 */
export function createDesktopClient(
	options: DesktopClientOptions = {},
): DesktopClient {
	const transport = new LocalSocketClientTransport({
		socketPath: options.socketPath,
		autoReconnect: options.autoReconnect ?? true,
		heartbeatInterval: 30_000,
	})

	const eventHandlers = new Set<(event: IpcEventMessage) => void>()
	const stateHandlers = new Set<(state: IpcConnectionState) => void>()
	let currentTransportState: IpcConnectionState = "idle"

	// Forward messages from transport.
	transport.onMessage((message: IpcMessage) => {
		if (message.type === "event") {
			for (const handler of eventHandlers) {
				try {
					handler(message as IpcEventMessage)
				} catch (error) {
					logger.error("Event handler threw:", error)
				}
			}
		}
	})

	// Forward state changes.
	transport.onStateChange((state: IpcConnectionState) => {
		currentTransportState = state
		for (const handler of stateHandlers) {
			try {
				handler(state)
			} catch (error) {
				logger.error("State handler threw:", error)
			}
		}

		if (state === "connected") {
			logger.info("Connected to daemon.")
		} else if (state === "disconnected") {
			logger.info("Disconnected from daemon.")
		} else if (state === "reconnecting") {
			logger.info("Reconnecting to daemon...")
		} else if (state === "error") {
			logger.warn("Connection error.")
		}
	})

	return {
		async connect(): Promise<void> {
			logger.info("Connecting to daemon...")
			await transport.connect()
		},

		async disconnect(): Promise<void> {
			logger.info("Disconnecting from daemon...")
			await transport.disconnect()
		},

		get state(): IpcConnectionState {
			return currentTransportState
		},

		onEvent(handler: (event: IpcEventMessage) => void): () => void {
			eventHandlers.add(handler)
			return () => {
				eventHandlers.delete(handler)
			}
		},

		onStateChange(handler: (state: IpcConnectionState) => void): () => void {
			stateHandlers.add(handler)
			return () => {
				stateHandlers.delete(handler)
			}
		},

		async request(
			method: string,
			params?: Record<string, unknown>,
		): Promise<unknown> {
			return request(transport, method, params)
		},
	}
}
