/**
 * AIRI Daemon — Lifecycle Management
 *
 * Manages the daemon process lifecycle: PID file, startup, shutdown,
 * crash logging, and stale socket cleanup.
 *
 * Design decisions:
 * - PID file prevents multiple daemon instances from running simultaneously.
 * - Shutdown is graceful: modules deactivate in reverse order, runtime
 *   disconnects, IPC server stops, and the PID file is removed.
 * - Crash logging writes to stderr with timestamps.
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Types ──────────────────────────────────────────────────────────────

export interface DaemonLifecycleOptions {
  /** Path for the PID file. @default /tmp/airi-daemon.pid */
  pidFile?: string

  /** Path for the socket file. @default /tmp/airi-daemon.sock */
  socketFile?: string
}

export interface DaemonLifecycle {
  /** Write the PID file. */
  writePidFile(): void

  /** Remove the PID file. */
  removePidFile(): void

  /** Check if another daemon instance is running. */
  isAlreadyRunning(): boolean

  /** Register signal handlers for graceful shutdown. */
  registerShutdownHandlers(shutdownFn: () => Promise<void>): void

  /** Log a crash with timestamp. */
  logCrash(error: unknown): void
}

// ── Implementation ────────────────────────────────────────────────────

/**
 * Create a daemon lifecycle manager.
 */
export function createDaemonLifecycle(options: DaemonLifecycleOptions = {}): DaemonLifecycle {
  const pidFile = resolve(options.pidFile ?? '/tmp/airi-daemon.pid')

  return {
    writePidFile(): void {
      writeFileSync(pidFile, String(process.pid), 'utf-8')
    },

    removePidFile(): void {
      try {
        if (existsSync(pidFile)) {
          unlinkSync(pidFile)
        }
      } catch {
        // Best-effort: ignore unlink errors during shutdown.
      }
    },

    isAlreadyRunning(): boolean {
      if (!existsSync(pidFile)) return false

      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
        if (isNaN(pid)) return false

        // Check if the process is still alive.
        // process.kill(pid, 0) throws if the process doesn't exist.
        try {
          process.kill(pid, 0)
          return true
        } catch {
          // Process is dead — stale PID file.
          return false
        }
      } catch {
        return false
      }
    },

    registerShutdownHandlers(shutdownFn: () => Promise<void>): void {
      const shutdown = async (signal: string) => {
        console.log(`\n[daemon] Received ${signal}, shutting down...`)
        try {
          await shutdownFn()
        } catch (error) {
          console.error('[daemon] Shutdown error:', error)
          process.exitCode = 1
        }
        process.exit()
      }

      process.on('SIGTERM', () => shutdown('SIGTERM'))
      process.on('SIGINT', () => shutdown('SIGINT'))

      // Handle uncaught errors.
      process.on('uncaughtException', (error) => {
        console.error('[daemon] Uncaught exception:', error)
        shutdown('uncaughtException')
      })

      process.on('unhandledRejection', (reason) => {
        console.error('[daemon] Unhandled rejection:', reason)
      })
    },

    logCrash(error: unknown): void {
      const timestamp = new Date().toISOString()
      const message = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined

      console.error(`[${timestamp}] [daemon] CRASH: ${message}`)
      if (stack) {
        console.error(stack)
      }
    },
  }
}
