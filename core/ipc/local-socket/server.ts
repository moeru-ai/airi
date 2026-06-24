/**
 * AIRI IPC — Unix Domain Socket Server Transport
 *
 * Server-side transport implementation using Node.js `net` module.
 * Listens on a Unix domain socket (Linux/macOS) or falls back to a
 * TCP localhost port on Windows.
 *
 * Protocol: length-prefixed JSON messages. Each message is sent as:
 *   [4 bytes: message length (big-endian uint32)][N bytes: UTF-8 JSON]
 *
 * This framing allows the receiver to correctly split the byte stream
 * into individual messages even when they arrive in arbitrary chunks.
 */

import { Socket, createServer, type Server as NetServer } from "node:net"
import { existsSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"

import type { IpcMessage } from "../protocol.js"
import type {
	IpcServerTransport,
	IpcConnectionState,
	IpcStateHandler,
} from "../transport.js"

// ── Types ──────────────────────────────────────────────────────────────

type ClientHandler = (clientId: string, message: IpcMessage) => void
type ConnectHandler = (clientId: string) => void
type DisconnectHandler = (clientId: string) => void

interface ClientEntry {
	socket: Socket
	id: string
}

// ── Constants ─────────────────────────────────────────────────────────

const HEADER_SIZE = 4 // bytes for message length prefix
const MAX_MESSAGE_SIZE = 1024 * 1024 // 1 MB max message size

// ── Server implementation ──────────────────────────────────────────────

/**
 * Unix domain socket server transport.
 *
 * Listens on a socket path and manages client connections. Each client
 * is assigned a unique ID upon connection.
 */
export class LocalSocketServerTransport implements IpcServerTransport {
	private _state: IpcConnectionState = "idle"
	private server: NetServer | null = null
	private readonly clients = new Map<string, ClientEntry>()
	private nextClientId = 1

	// Handlers
	private readonly messageHandlers = new Set<ClientHandler>()
	private readonly connectHandlers = new Set<ConnectHandler>()
	private readonly disconnectHandlers = new Set<DisconnectHandler>()
	private readonly stateHandlers = new Set<IpcStateHandler>()

	/** Socket file path or TCP address. */
	readonly socketPath: string

	/**
	 * @param socketPath - Unix socket file path, or TCP address like "127.0.0.1:0".
	 *                     If not provided, defaults to a platform-appropriate path.
	 */
	constructor(socketPath?: string) {
		this.socketPath = socketPath ?? getDefaultSocketPath()
	}

	// ── IpcServerTransport ─────────────────────────────────────────────

	get state(): IpcConnectionState {
		return this._state
	}

	async start(): Promise<void> {
		if (this._state === "connected") return undefined

		this.setState("connecting")

		// Clean up stale socket file if it exists.
		await this.cleanupStaleSocket()

		return new Promise<void>((resolve, reject) => {
			this.server = createServer()

			this.server.on("error", (err) => {
				this.setState("error", err.message)
				reject(err)
			})

			this.server.on("connection", (socket) => this.handleConnection(socket))

			this.server.listen(this.socketPath, () => {
				this.setState("connected")
				resolve()
			})
		})
	}

	// async: implements TransportServer interface (Promise<void>)
	async stop(): Promise<void> {
		if (this._state === "idle" || this._state === "disconnected") return undefined

		this.setState("disconnecting")

		// Disconnect all clients.
		for (const [id, entry] of this.clients) {
			entry.socket.destroy()
			this.clients.delete(id)
			for (const handler of this.disconnectHandlers) {
				try {
					handler(id)
				} catch (error) {
					console.error("[LocalSocketServer] Disconnect handler threw:", error)
				}
			}
		}

		return new Promise<void>((resolve, reject) => {
			if (!this.server) {
				this.setState("disconnected")
				resolve()
				return
			}

			this.server.close((err) => {
				this.server = null
				if (err) {
					this.setState("error", err.message)
					reject(err)
				} else {
					this.setState("disconnected")
					resolve()
				}
			})
		})
	}

	async send(clientId: string, message: IpcMessage): Promise<void> {
		const entry = this.clients.get(clientId)
		if (!entry) {
			throw new Error(`Client "${clientId}" is not connected.`)
		}

		const data = LocalSocketServerTransport.encodeMessage(message)
		return new Promise<void>((resolve, reject) => {
			entry.socket.write(data, (err) => {
				if (err) reject(err)
				else resolve()
			})
		})
	}

	async broadcast(message: IpcMessage): Promise<void> {
		const data = LocalSocketServerTransport.encodeMessage(message)
		const promises: Promise<void>[] = []

		for (const [, entry] of this.clients) {
			promises.push(
				new Promise<void>((resolve) => {
					entry.socket.write(data, () => resolve())
				}),
			)
		}

		// Wait for all sends to complete (or fail silently).
		await Promise.allSettled(promises)
	}

	onMessage(handler: ClientHandler): () => void {
		this.messageHandlers.add(handler)
		return () => {
			this.messageHandlers.delete(handler)
		}
	}

	onClientConnect(handler: ConnectHandler): () => void {
		this.connectHandlers.add(handler)
		return () => {
			this.connectHandlers.delete(handler)
		}
	}

	onClientDisconnect(handler: DisconnectHandler): () => void {
		this.disconnectHandlers.add(handler)
		return () => {
			this.disconnectHandlers.delete(handler)
		}
	}

	onStateChange(handler: IpcStateHandler): () => void {
		this.stateHandlers.add(handler)
		return () => {
			this.stateHandlers.delete(handler)
		}
	}

	connectedClients(): string[] {
		return [...this.clients.keys()]
	}

	// ── Stale socket cleanup ───────────────────────────────────────────

	/**
	 * Remove a stale socket file if it exists.
	 *
	 * A stale file can remain if the daemon crashed without running
	 * its shutdown handler. We attempt to connect to verify staleness;
	 * if the connection fails, the file is safe to remove.
	 */
	// async: returns Promise for async socket probe
	async cleanupStaleSocket(): Promise<void> {
		if (!this.socketPath.startsWith("/")) return undefined // TCP fallback — no file to clean.

		const absolutePath = resolve(this.socketPath)
		if (!existsSync(absolutePath)) return undefined

		// Try to connect — if it fails, the socket is stale.
		// Wrap the async socket probe in a Promise so callers can await it,
		// preventing a race between cleanup and server.listen().
		return new Promise<void>((resolve, reject) => {
			const testSocket = new Socket()
			testSocket.on("connect", () => {
				// Socket is alive — another daemon is running.
				testSocket.destroy()
				reject(new Error(`Socket path "${absolutePath}" is already in use. Is another daemon running?`))
			})
			testSocket.on("error", () => {
				// Connection failed — socket is stale, remove it.
				try {
					unlinkSync(absolutePath)
				} catch {
					// Best-effort: ignore unlink errors.
				}
				testSocket.destroy()
				resolve()
			})
			testSocket.connect(absolutePath)
		})
	}

	// ── Private: connection handling ───────────────────────────────────

	private handleConnection(socket: Socket): void {
		const clientId = `client-${this.nextClientId++}`
		const entry: ClientEntry = { socket, id: clientId }
		this.clients.set(clientId, entry)

		// Buffer for incoming data.
		let buffer = Buffer.alloc(0)
		let expectedLength: number | null = null

		socket.on("data", (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk])

			// Process as many complete messages as possible.
			while (true) {
				if (expectedLength === null) {
					// Need at least HEADER_SIZE bytes to read the length prefix.
					if (buffer.length < HEADER_SIZE) break

					expectedLength = buffer.readUInt32BE(0)

					if (expectedLength > MAX_MESSAGE_SIZE) {
						console.error(
							`[LocalSocketServer] Message too large (${expectedLength} bytes), dropping client ${clientId}.`,
						)
						socket.destroy()
						return
					}

					buffer = buffer.subarray(HEADER_SIZE)
				}

				if (buffer.length < expectedLength) break

				// We have a complete message.
				const messageBytes = buffer.subarray(0, expectedLength)
				buffer = buffer.subarray(expectedLength)
				expectedLength = null

				try {
					const json = messageBytes.toString("utf-8")
					const parsed = JSON.parse(json) as IpcMessage

					for (const handler of this.messageHandlers) {
						try {
							handler(clientId, parsed)
						} catch (error) {
							console.error("[LocalSocketServer] Message handler threw:", error)
						}
					}
				} catch (error) {
					console.error(
						"[LocalSocketServer] Failed to parse message:",
						error instanceof Error ? error.message : String(error),
					)
				}
			}
		})

		socket.on("close", () => {
			this.clients.delete(clientId)
			for (const handler of this.disconnectHandlers) {
				try {
					handler(clientId)
				} catch (error) {
					console.error("[LocalSocketServer] Disconnect handler threw:", error)
				}
			}
		})

		socket.on("error", (err) => {
			console.error(`[LocalSocketServer] Client ${clientId} socket error:`, err.message)
		})

		// Notify listeners.
		for (const handler of this.connectHandlers) {
			try {
				handler(clientId)
			} catch (error) {
				console.error("[LocalSocketServer] Connect handler threw:", error)
			}
		}
	}

	// ── Private: encoding ──────────────────────────────────────────────

	/**
	 * Encode an IPC message into a length-prefixed byte buffer.
	 *
	 * Format: [4 bytes: length][N bytes: UTF-8 JSON]
	 */
	private static encodeMessage(message: IpcMessage): Buffer {
		const json = JSON.stringify(message)
		const payload = Buffer.from(json, "utf-8")
		const header = Buffer.alloc(HEADER_SIZE)
		header.writeUInt32BE(payload.length, 0)
		return Buffer.concat([header, payload])
	}

	// ── Private: state management ──────────────────────────────────────

	private setState(state: IpcConnectionState, error?: string): void {
		this._state = state
		for (const handler of this.stateHandlers) {
			try {
				handler(state, error)
			} catch (err) {
				console.error("[LocalSocketServer] State handler threw:", err)
			}
		}
	}
}

// ── Platform detection ────────────────────────────────────────────────

/**
 * Return a platform-appropriate default socket path.
 *
 * - Linux/macOS: /tmp/airi-daemon.sock
 * - Windows: \\.\pipe\airi-daemon (not yet implemented, falls back to TCP)
 */
function getDefaultSocketPath(): string {
	if (process.platform === "win32") {
		// Windows: use TCP localhost with a fixed port.
		// Named pipes would require a different implementation.
		return "127.0.0.1:19837"
	}

	return "/tmp/airi-daemon.sock"
}
