/**
 * AIRI Desktop — Entry Point Stub
 *
 * This is a minimal stub that demonstrates connecting to the daemon
 * via IPC. No UI is implemented — just connection, event subscription,
 * and graceful shutdown.
 *
 * In production, this would be the Electron main process entry point.
 */

import { createDesktopClient } from "./client.js"
import { createLogger } from "../../../core/logger.js"

const logger = createLogger("desktop")

async function main(): Promise<void> {
	logger.info("Starting AIRI desktop client...")

	const client = createDesktopClient()

	// Subscribe to events.
	client.onEvent((event) => {
		logger.info(`Received event: ${JSON.stringify(event.payload)}`)
	})

	// Subscribe to state changes.
	client.onStateChange((state) => {
		logger.info(`Connection state: ${state}`)
	})

	// Connect to daemon.
	try {
		await client.connect()
		logger.info("Connected to daemon.")
	} catch (error) {
		logger.error(
			"Failed to connect to daemon:",
			error instanceof Error ? error.message : String(error),
		)
		logger.info("Will auto-reconnect...")
	}

	// Example: send a request after a short delay.
	setTimeout(async () => {
		try {
			const result = await client.request("module.list")
			logger.info(`Module list: ${JSON.stringify(result)}`)
		} catch (error) {
			logger.error(
				"Request failed:",
				error instanceof Error ? error.message : String(error),
			)
		}
	}, 1000)

	// Handle shutdown.
	const shutdown = async () => {
		logger.info("Shutting down desktop client...")
		await client.disconnect()
		process.exit(0)
	}

	process.on("SIGTERM", shutdown)
	process.on("SIGINT", shutdown)

	logger.info("Desktop client is running. Press Ctrl+C to exit.")
}

main().catch((error) => {
	logger.error("Desktop client crashed:", error)
	process.exit(1)
})
