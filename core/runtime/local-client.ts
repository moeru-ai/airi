/**
 * AIRI Core — Local In-Process Runtime Client
 *
 * Minimal RuntimeClient implementation that routes all messaging through
 * an in-memory EventBus. No networking, no serialization, no external
 * dependencies.
 *
 * Design decisions:
 * - Internally uses EventBus: send() publishes to the bus, subscribe()
 *   listens on the bus. This means local subscribers receive messages
 *   from local senders without any transport overhead.
 * - State machine: disconnected → connecting → connected (with error
 *   and reconnecting states reserved for future transport implementations).
 * - Idempotent connect/disconnect: calling connect() while already
 *   connected is a no-op, same for disconnect().
 */

import type { EventBus } from "../events/bus.js"
import type { RuntimeClient, RuntimeConnectionState, RuntimeMessageHandler, RuntimeStateHandler } from "./client.js"

/**
 * Creates a local RuntimeClient backed by the given EventBus.
 *
 * The client routes send/subscribe through the bus so that local
 * subscribers receive messages from local senders without any
 * transport overhead.
 *
 * @param bus — The EventBus instance to route messages through.
 *
 * @example
 * ```ts
 * const bus = new EventBus()
 * const client = createLocalRuntimeClient(bus)
 * await client.connect()
 *
 * client.subscribe("code.inbound", (payload) => {
 *   console.log("Received:", payload)
 * })
 *
 * await client.send("code.outbound", { kind: "ping" })
 * ```
 */
export function createLocalRuntimeClient(bus: EventBus): LocalRuntimeClient {
	return new LocalRuntimeClient(bus)
}

/**
 * Local in-process runtime client implementation.
 *
 * Wraps an EventBus to provide the RuntimeClient interface. All
 * messaging is in-process — no networking, no serialization.
 */
export class LocalRuntimeClient implements RuntimeClient {
	private _state: RuntimeConnectionState = "disconnected"
	private readonly stateHandlers = new Set<RuntimeStateHandler>()

	/** Channel prefix to avoid collisions with non-runtime events. */
	private readonly channelPrefix = "runtime."

	constructor(private readonly bus: EventBus) {}

	// ── RuntimeClient interface ────────────────────────────────────────

	get state(): RuntimeConnectionState {
		return this._state
	}

	connect(): Promise<void> {
		if (this._state === "connected") return Promise.resolve()

		this._state = "connecting"
		this.notifyStateChange("connecting")

		// In-process connection is always immediate.
		this._state = "connected"
		this.notifyStateChange("connected")
		return Promise.resolve()
	}

	disconnect(): Promise<void> {
		if (this._state === "disconnected") return Promise.resolve()

		this._state = "disconnected"
		this.notifyStateChange("disconnected")
		return Promise.resolve()
	}

	send(channel: string, payload: unknown): Promise<void> {
		if (this._state !== "connected") {
			throw new Error(`Cannot send on channel "${channel}": client is ${this._state}.`)
		}

		// Publish through the bus so local subscribers receive it.
		this.bus.emit(this.channelPrefix + channel, payload)
		return Promise.resolve()
	}

	subscribe(channel: string, handler: RuntimeMessageHandler): () => void {
		// Listen on the bus for messages on this channel.
		const unsubscribe = this.bus.on(this.channelPrefix + channel, (payload) => {
			handler(channel, payload)
		})

		return unsubscribe
	}

	onStateChange(handler: RuntimeStateHandler): () => void {
		this.stateHandlers.add(handler)

		return () => {
			this.stateHandlers.delete(handler)
		}
	}

	// ── Private ────────────────────────────────────────────────────────

	private notifyStateChange(state: RuntimeConnectionState): void {
		for (const handler of this.stateHandlers) {
			try {
				handler(state)
			} catch (error) {
				console.error(
					"[LocalRuntimeClient] State change handler threw:",
					error instanceof Error ? error.message : String(error),
				)
			}
		}
	}
}
