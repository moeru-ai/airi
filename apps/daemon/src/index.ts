/**
 * AIRI Daemon — Entry Point
 *
 * The daemon is the long-lived backend process that owns:
 * - EventBus (inter-module communication)
 * - ModuleRegistry (module lifecycle)
 * - RuntimeClient (external communication)
 * - IPC server (client connections)
 *
 * It bootstraps the core, starts the IPC server, and streams events
 * to connected frontend clients.
 */

import { bootstrap } from "../../../core/bootstrap.js"
import { createLogger } from "../../../core/logger.js"
import type { AiriEvent } from "../../../core/events/types.js"
import type { IpcEventMessage } from "../../../core/ipc/protocol.js"
import { LocalSocketServerTransport } from "../../../core/ipc/local-socket/server.js"
import { SessionManager } from "../../../core/runtime/session.js"
import { createDaemonLifecycle } from "./lifecycle.js"

const logger = createLogger("daemon")
const lifecycle = createDaemonLifecycle()

async function main(): Promise<void> {
	logger.info("Starting AIRI daemon...")

	// Check for existing instance.
	if (lifecycle.isAlreadyRunning()) {
		logger.error("Another daemon instance is already running. Exiting.")
		process.exit(1)
	}

	// Write PID file.
	lifecycle.writePidFile()
	logger.info(`PID: ${process.pid}`)

	// ── Phase 1: Bootstrap core ────────────────────────────────────────
	logger.info("Bootstrapping core...")
	const core = await bootstrap()
	logger.info("Core bootstrapped successfully.")

	// ── Phase 2: Create session manager ────────────────────────────────
	const sessions = new SessionManager()

	// ── Phase 3: Create IPC server ─────────────────────────────────────
	logger.info("Starting IPC server...")
	const ipcServer = new LocalSocketServerTransport()
	await ipcServer.start()
	logger.info("IPC server started.")

	// ── Phase 4: Wire up client connections ────────────────────────────
	ipcServer.onClientConnect((clientId) => {
		const session = sessions.attach(clientId, {
			connectedAt: new Date().toISOString(),
		})
		sessions.markAttached(session.sessionId)
		logger.info(`Client connected: ${clientId} (session: ${session.sessionId})`)
	})

	ipcServer.onClientDisconnect((clientId) => {
		const session = sessions.getByClientId(clientId)
		if (session) {
			sessions.detach(session.sessionId)
			logger.info(`Client disconnected: ${clientId} (session: ${session.sessionId})`)
		}
	})

	// ── Phase 5: Handle client messages ────────────────────────────────
	ipcServer.onMessage((clientId, message) => {
		logger.debug(`Message from ${clientId}: type=${message.type}`)

		// Handle requests.
		if (message.type === "request") {
			handleClientRequest(clientId, message, core, ipcServer, sessions).catch(
				(error) => {
					logger.error(`Request handler error for ${clientId}:`, error)
				},
			)
		}
	})

	// ── Phase 6: Stream events to clients ──────────────────────────────
	core.events.on("module.activated", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "module.activated")
	})

	core.events.on("module.crashed", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "module.crashed")
	})

	core.events.on("task.started", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "task.started")
	})

	core.events.on("task.completed", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "task.completed")
	})

	core.events.on("tool.called", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "tool.called")
	})

	core.events.on("tool.finished", (payload) => {
		broadcastEvent(ipcServer, payload as AiriEvent, "tool.finished")
	})

	// ── Phase 7: Register shutdown handlers ────────────────────────────
	lifecycle.registerShutdownHandlers(async () => {
		logger.info("Shutting down daemon...")

		// Stop accepting new connections.
		await ipcServer.stop()

		// Shutdown core (deactivates modules, disconnects runtime).
		await core.shutdown()

		// Clean up sessions.
		sessions.cleanupDetached()

		// Remove PID file.
		lifecycle.removePidFile()

		logger.info("Daemon shutdown complete.")
	})

	logger.info("AIRI daemon is ready.")
}

// ── Request handling ──────────────────────────────────────────────────

async function handleClientRequest(
	clientId: string,
	message: { id: string; method: string; params?: Record<string, unknown> },
	core: Awaited<ReturnType<typeof bootstrap>>,
	ipcServer: LocalSocketServerTransport,
	sessions: SessionManager,
): Promise<void> {
	const { id, method, params } = message

	try {
		let result: unknown

		switch (method) {
			case "module.list":
				result = {
					modules: core.registry.ids().map((moduleId) => ({
						id: moduleId,
						active: core.registry.isActive(moduleId),
					})),
				}
				break

			case "module.status": {
				const moduleId = params?.["id"] as string | undefined
				if (!moduleId) {
					throw new Error("Missing required param: id")
				}
				result = {
					id: moduleId,
					active: core.registry.isActive(moduleId),
					exists: core.registry.get(moduleId) !== undefined,
				}
				break
			}

			case "runtime.status":
				result = {
					state: core.runtime.state,
				}
				break

			case "session.list":
				result = {
					sessions: sessions.connected().map((s) => ({
						sessionId: s.sessionId,
						clientId: s.clientId,
						state: s.state,
						createdAt: s.createdAt,
					})),
				}
				break

			default:
				throw new Error(`Unknown method: ${method}`)
		}

		await ipcServer.send(clientId, {
			id: crypto.randomUUID(),
			type: "response",
			timestamp: new Date().toISOString(),
			correlationId: id,
			result,
		})
	} catch (error) {
		await ipcServer.send(clientId, {
			id: crypto.randomUUID(),
			type: "error",
			timestamp: new Date().toISOString(),
			correlationId: id,
			code: "REQUEST_ERROR",
			message: error instanceof Error ? error.message : String(error),
		})
	}
}

// ── Event broadcasting ────────────────────────────────────────────────

function broadcastEvent(
	ipcServer: LocalSocketServerTransport,
	event: AiriEvent,
	_eventName: string,
): void {
	const message: IpcEventMessage = {
		id: crypto.randomUUID(),
		type: "event",
		timestamp: event.timestamp,
		payload: event as unknown as Record<string, unknown>,
	}

	ipcServer.broadcast(message).catch((error) => {
		logger.error("Failed to broadcast event:", error)
	})
}

// ── Start ─────────────────────────────────────────────────────────────

main().catch((error) => {
	lifecycle.logCrash(error)
	lifecycle.removePidFile()
	process.exit(1)
})
