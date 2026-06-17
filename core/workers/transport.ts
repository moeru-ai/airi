/**
 * AIRI Core — Worker Transport Layer
 *
 * Transport layer for daemon ↔ worker communication over stdio.
 * Uses length-prefixed JSON framing (4-byte big-endian header), matching
 * the existing local-socket transport pattern.
 *
 * The daemon side uses WorkerTransport to communicate with a worker subprocess.
 * The worker process uses the same framing to read from stdin and write to stdout.
 */

import { type ChildProcess } from "node:child_process"

import type { WorkerMessage } from "./protocol.js"
import { serializeWorkerMessage, deserializeWorkerMessage } from "./protocol.js"

// ── Constants ─────────────────────────────────────────────────────────

const HEADER_SIZE = 4 // bytes for message length prefix
const MAX_MESSAGE_SIZE = 1024 * 1024 // 1 MB max message size

// ── Transport interface ────────────────────────────────────────────────

/**
 * Transport for communicating with a worker subprocess.
 *
 * Wraps the stdin/stdout pipes of a Node.js ChildProcess.
 * Sending writes to the worker's stdin; receiving reads from its stdout.
 */
export interface WorkerTransport {
	/**
	 * Send a message to the worker.
	 *
	 * Serializes the message as length-prefixed JSON and writes it
	 * to the worker's stdin.
	 */
	send(message: WorkerMessage): Promise<void>

	/**
	 * Register a handler for messages received from the worker.
	 *
	 * The handler is invoked for each complete message decoded from
	 * the worker's stdout.
	 *
	 * Returns an unsubscribe function.
	 */
	onMessage(handler: (message: WorkerMessage) => void): () => void

	/**
	 * Close the transport and destroy the underlying process pipes.
	 */
	close(): void

	/**
	 * Whether the transport's process is still alive.
	 */
	isAlive(): boolean
}

// ── Stdio transport implementation ─────────────────────────────────────

/**
 * Communicates with a worker subprocess via stdin/stdout using
 * length-prefixed JSON framing.
 *
 * Format: [4 bytes: message length (big-endian uint32)][N bytes: UTF-8 JSON]
 */
export class StdioWorkerTransport implements WorkerTransport {
	private readonly process: ChildProcess
	private readonly messageHandlers = new Set<(message: WorkerMessage) => void>()
	private stdinBuffer = Buffer.alloc(0)
	private stdinExpectedLength: number | null = null
	private stdoutBuffer = Buffer.alloc(0)
	private stdoutExpectedLength: number | null = null
	private closed = false

	/**
	 * @param process - The worker subprocess. Must have stdin/stdout streams.
	 */
	constructor(process: ChildProcess) {
		this.process = process
		this.setupStdout()
		this.setupStdin()
	}

	// ── WorkerTransport ───────────────────────────────────────────────

	send(message: WorkerMessage): Promise<void> {
		if (this.closed || !this.process.stdin || this.process.stdin.destroyed) {
			return Promise.reject(new Error("Transport is closed or stdin is destroyed."))
		}

		const data = StdioWorkerTransport.encodeMessage(message)
		return new Promise<void>((resolve, reject) => {
			this.process.stdin!.write(data, (err) => {
				if (err) reject(err)
				else resolve()
			})
		})
	}

	onMessage(handler: (message: WorkerMessage) => void): () => void {
		this.messageHandlers.add(handler)
		return () => {
			this.messageHandlers.delete(handler)
		}
	}

	close(): void {
		if (this.closed) return
		this.closed = true

		// Destroy pipes.
		if (this.process.stdout && !this.process.stdout.destroyed) {
			this.process.stdout.destroy()
		}
		if (this.process.stdin && !this.process.stdin.destroyed) {
			this.process.stdin.destroy()
		}

		this.messageHandlers.clear()
	}

	isAlive(): boolean {
		return !this.closed && !this.process.killed && this.process.exitCode === null
	}

	// ── Private: stdout reading (messages FROM worker) ───────────────

	/**
	 * Set up data handling on the worker's stdout.
	 *
	 * Reads length-prefixed JSON messages and dispatches them to handlers.
	 */
	private setupStdout(): void {
		const stdout = this.process.stdout
		if (!stdout) return

		stdout.on("data", (chunk: Buffer) => {
			if (this.closed) return

			this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk])

			// Process as many complete messages as possible.
			while (true) {
				if (this.stdoutExpectedLength === null) {
					if (this.stdoutBuffer.length < HEADER_SIZE) break

					this.stdoutExpectedLength = this.stdoutBuffer.readUInt32BE(0)

					if (this.stdoutExpectedLength > MAX_MESSAGE_SIZE) {
						console.error(
							`[StdioWorkerTransport] Message too large (${this.stdoutExpectedLength} bytes), closing.`,
						)
						this.close()
						return
					}

					this.stdoutBuffer = this.stdoutBuffer.subarray(HEADER_SIZE)
				}

				if (this.stdoutBuffer.length < this.stdoutExpectedLength) break

				const messageBytes = this.stdoutBuffer.subarray(0, this.stdoutExpectedLength)
				this.stdoutBuffer = this.stdoutBuffer.subarray(this.stdoutExpectedLength)
				this.stdoutExpectedLength = null

				try {
					const json = messageBytes.toString("utf-8")
					const parsed = deserializeWorkerMessage(json)
					if (parsed) {
						for (const handler of this.messageHandlers) {
							try {
								handler(parsed)
							} catch (error) {
								console.error(
									"[StdioWorkerTransport] Message handler threw:",
									error instanceof Error ? error.message : String(error),
								)
							}
						}
					}
				} catch (error) {
					console.error(
						"[StdioWorkerTransport] Failed to parse message:",
						error instanceof Error ? error.message : String(error),
					)
				}
			}
		})

		stdout.on("error", (err) => {
			console.error("[StdioWorkerTransport] stdout error:", err.message)
		})

		stdout.on("end", () => {
			// Worker's stdout closed — the process is likely exiting.
			this.closed = true
		})
	}

	// ── Private: stdin reading (messages FROM daemon, for worker side) ─

	/**
	 * Set up data handling on the worker's stdin.
	 *
	 * This is used when the transport is created on the worker side
	 * (i.e., the worker reads tasks from the daemon via its stdin).
	 * The daemon-side transport doesn't need this since it only writes.
	 */
	private setupStdin(): void {
		const stdin = this.process.stdin
		if (!stdin) return

		stdin.on("data", (chunk: Buffer) => {
			if (this.closed) return

			this.stdinBuffer = Buffer.concat([this.stdinBuffer, chunk])

			while (true) {
				if (this.stdinExpectedLength === null) {
					if (this.stdinBuffer.length < HEADER_SIZE) break

					this.stdinExpectedLength = this.stdinBuffer.readUInt32BE(0)

					if (this.stdinExpectedLength > MAX_MESSAGE_SIZE) {
						console.error(
							`[StdioWorkerTransport] Incoming message too large (${this.stdinExpectedLength} bytes), closing.`,
						)
						this.close()
						return
					}

					this.stdinBuffer = this.stdinBuffer.subarray(HEADER_SIZE)
				}

				if (this.stdinBuffer.length < this.stdinExpectedLength) break

				const messageBytes = this.stdinBuffer.subarray(0, this.stdinExpectedLength)
				this.stdinBuffer = this.stdinBuffer.subarray(this.stdinExpectedLength)
				this.stdinExpectedLength = null

				try {
					const json = messageBytes.toString("utf-8")
					const parsed = deserializeWorkerMessage(json)
					if (parsed) {
						for (const handler of this.messageHandlers) {
							try {
								handler(parsed)
							} catch (error) {
								console.error(
									"[StdioWorkerTransport] Stdin handler threw:",
									error instanceof Error ? error.message : String(error),
								)
							}
						}
					}
				} catch (error) {
					console.error(
						"[StdioWorkerTransport] Failed to parse stdin message:",
						error instanceof Error ? error.message : String(error),
					)
				}
			}
		})

		stdin.on("error", (err) => {
			console.error("[StdioWorkerTransport] stdin error:", err.message)
		})
	}

	// ── Private: encoding ─────────────────────────────────────────────

	/**
	 * Encode a worker message into a length-prefixed byte buffer.
	 *
	 * Format: [4 bytes: length][N bytes: UTF-8 JSON]
	 */
	private static encodeMessage(message: WorkerMessage): Buffer {
		const json = serializeWorkerMessage(message)
		const payload = Buffer.from(json, "utf-8")
		const header = Buffer.alloc(HEADER_SIZE)
		header.writeUInt32BE(payload.length, 0)
		return Buffer.concat([header, payload])
	}
}
