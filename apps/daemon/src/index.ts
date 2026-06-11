/**
 * AIRI Daemon — Entry Point
 *
 * The daemon is the long-lived backend process that owns:
 * - EventBus (inter-module communication)
 * - ModuleRegistry (module lifecycle)
 * - RuntimeClient (external communication)
 * - IPC server (client connections)
 * - TaskManager (task orchestration)
 * - TaskScheduler (task dispatch)
 * - TaskReplayBuffer (reconnect support)
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
import {
	TaskManager,
	TaskScheduler,
	TaskReplayBuffer,
} from "../../../core/tasks/index.js"
import type { Task, TaskQueued, TaskProgress, TaskFailed, TaskCancelled } from "../../../core/tasks/index.js"
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

	// ── Phase 3: Create task orchestration ──────────────────────────────
	logger.info("Initializing task orchestration...")
	const taskManager = new TaskManager(core.events, logger)
	const taskScheduler = new TaskScheduler(taskManager, core.events, logger, {
		concurrencyLimit: 4,
	})
	const replayBuffer = new TaskReplayBuffer({ maxEvents: 500 })

	// Wire up task events → IPC broadcast + replay buffer.
	wireTaskEvents(core.events, taskManager, replayBuffer)

	taskManager.start()
	taskScheduler.start()
	logger.info("Task orchestration initialized.")

	// ── Phase 4: Create IPC server ─────────────────────────────────────
	logger.info("Starting IPC server...")
	const ipcServer = new LocalSocketServerTransport()
	await ipcServer.start()
	logger.info("IPC server started.")

	// ── Phase 5: Wire up client connections ────────────────────────────
	ipcServer.onClientConnect((clientId) => {
		const session = sessions.attach(clientId, {
			connectedAt: new Date().toISOString(),
		})
		sessions.markAttached(session.sessionId)
		logger.info(`Client connected: ${clientId} (session: ${session.sessionId})`)

		// Send replay buffer snapshot to the new client.
		sendReplaySnapshot(clientId, ipcServer, taskManager, replayBuffer)
	})

	ipcServer.onClientDisconnect((clientId) => {
		const session = sessions.getByClientId(clientId)
		if (session) {
			sessions.detach(session.sessionId)
			logger.info(`Client disconnected: ${clientId} (session: ${session.sessionId})`)
		}
	})

	// ── Phase 6: Handle client messages ────────────────────────────────
	ipcServer.onMessage((clientId, message) => {
		logger.debug(`Message from ${clientId}: type=${message.type}`)

		// Handle requests.
		if (message.type === "request") {
			handleClientRequest(clientId, message, core, ipcServer, sessions, taskManager).catch(
				(error) => {
					logger.error(`Request handler error for ${clientId}:`, error)
				},
			)
		}
	})

	// ── Phase 7: Stream events to clients ──────────────────────────────
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

	// ── Phase 8: Register shutdown handlers ────────────────────────────
	lifecycle.registerShutdownHandlers(async () => {
		logger.info("Shutting down daemon...")

		// Stop accepting new connections.
		await ipcServer.stop()

		// Stop task orchestration.
		taskScheduler.stop()
		taskManager.stop()

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

// ── Task event wiring ───────────────────────────────────────────────────

/**
 * Wire up task orchestration events to IPC broadcast and replay buffer.
 */
function wireTaskEvents(
	events: ReturnType<typeof bootstrap> extends Promise<infer T> ? T["events"] : never,
	manager: TaskManager,
	buffer: TaskReplayBuffer,
): void {
	// We use a small helper to track previous state for replay buffer.
	const previousStates = new Map<string, string>()

	// Listen for all task-related events and record them.
	events.on("task.queued", (payload) => {
		const event = payload as TaskQueued
		const task = manager.get(event.taskId)
		if (task) {
			buffer.record(task, "pending", "queued")
		}
		previousStates.set(event.taskId, "queued")
	})

	events.on("task.progress", (payload) => {
		const event = payload as TaskProgress
		const task = manager.get(event.taskId)
		if (task) {
			buffer.record(task, previousStates.get(event.taskId) ?? "running", "running")
		}
		previousStates.set(event.taskId, "running")
	})

	events.on("task.failed", (payload) => {
		const event = payload as TaskFailed
		const task = manager.get(event.taskId)
		if (task) {
			buffer.record(task, previousStates.get(event.taskId) ?? "running", "failed")
		}
		previousStates.set(event.taskId, "failed")
	})

	events.on("task.cancelled", (payload) => {
		const event = payload as TaskCancelled
		const task = manager.get(event.taskId)
		if (task) {
			buffer.record(task, previousStates.get(event.taskId) ?? "queued", "cancelled")
		}
		previousStates.set(event.taskId, "cancelled")
	})
}

// ── Replay snapshot ─────────────────────────────────────────────────────

/**
 * Send a replay snapshot to a newly connected client.
 */
function sendReplaySnapshot(
	clientId: string,
	ipcServer: LocalSocketServerTransport,
	manager: TaskManager,
	buffer: TaskReplayBuffer,
): void {
	const snapshot = buffer.buildSnapshot()
	const tasks = manager.list()

	// Send current task states as a special replay message.
	const message: IpcEventMessage = {
		id: crypto.randomUUID(),
		type: "event",
		timestamp: new Date().toISOString(),
		payload: {
			type: "task.snapshot",
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				state: t.state,
				progress: t.progress,
				moduleId: t.moduleId,
				priority: t.priority,
			})),
			recentEvents: buffer.getRecent(50).map((e) => ({
				timestamp: e.timestamp,
				taskId: e.taskId,
				previousState: e.previousState,
				newState: e.newState,
			})),
		},
	}

	ipcServer.send(clientId, message).catch((error) => {
		logger.error(`Failed to send replay snapshot to ${clientId}:`, error)
	})
}

// ── Request handling ──────────────────────────────────────────────────

async function handleClientRequest(
	clientId: string,
	message: { id: string; method: string; params?: Record<string, unknown> },
	core: Awaited<ReturnType<typeof bootstrap>>,
	ipcServer: LocalSocketServerTransport,
	sessions: SessionManager,
	taskManager: TaskManager,
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

			// ── Task APIs ──────────────────────────────────────────────

			case "task.create": {
				const title = params?.["title"] as string | undefined
				if (!title) {
					throw new Error("Missing required param: title")
				}

				const task = taskManager.createTask({
					title,
					description: params?.["description"] as string | undefined,
					priority: params?.["priority"] as Task["priority"] | undefined,
					moduleId: params?.["moduleId"] as string | undefined,
					metadata: params?.["metadata"] as Record<string, unknown> | undefined,
				})

				// Auto-queue the task.
				taskManager.queue(task.id as string)

				// Emit task.queued event.
				const session = sessions.getByClientId(clientId)
				const queuedEvent: TaskQueued = {
					type: "task.queued",
					timestamp: new Date().toISOString(),
					source: "daemon",
					taskId: task.id as string,
					moduleId: task.moduleId,
					priority: task.priority,
					label: task.title,
				}
				core.events.emit("task.queued", queuedEvent)

				result = {
					task: {
						id: task.id,
						title: task.title,
						state: task.state,
						priority: task.priority,
						moduleId: task.moduleId,
						createdAt: task.createdAt,
					},
				}
				break
			}

			case "task.cancel": {
				const taskId = params?.["taskId"] as string | undefined
				if (!taskId) {
					throw new Error("Missing required param: taskId")
				}

				const reason = params?.["reason"] as string | undefined
				const task = taskManager.cancel(taskId, reason)

				if (!task) {
					throw new Error(`Task not found: ${taskId}`)
				}

				// Emit task.cancelled event.
				const cancelledEvent: TaskCancelled = {
					type: "task.cancelled",
					timestamp: new Date().toISOString(),
					source: "daemon",
					taskId,
					reason,
				}
				core.events.emit("task.cancelled", cancelledEvent)

				result = {
					task: {
						id: task.id,
						state: task.state,
						cancellation: task.cancellation,
					},
				}
				break
			}

			case "task.list": {
				const filter: { state?: string; moduleId?: string } = {}
				if (params?.["state"]) filter.state = params["state"] as string
				if (params?.["moduleId"]) filter.moduleId = params["moduleId"] as string

				const tasks = taskManager.list(filter)
				result = {
					tasks: tasks.map((t) => ({
						id: t.id,
						title: t.title,
						state: t.state,
						progress: t.progress,
						priority: t.priority,
						moduleId: t.moduleId,
						createdAt: t.createdAt,
						updatedAt: t.updatedAt,
						startedAt: t.startedAt,
						completedAt: t.completedAt,
					})),
				}
				break
			}

			case "task.get": {
				const taskId = params?.["taskId"] as string | undefined
				if (!taskId) {
					throw new Error("Missing required param: taskId")
				}

				const task = taskManager.get(taskId)
				if (!task) {
					throw new Error(`Task not found: ${taskId}`)
				}

				result = { task }
				break
			}

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
