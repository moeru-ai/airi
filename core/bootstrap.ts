/**
 * AIRI Core — Bootstrap Lifecycle
 *
 * Orchestrates startup and shutdown of the AIRI core subsystem:
 * EventBus → RuntimeClient → CapabilityRegistry → ModuleRegistry → Module activation.
 *
 * Lifecycle:
 * 1. Create EventBus (inter-module communication).
 * 2. Create RuntimeClient (external communication, currently local-only).
 * 3. Create CapabilityRegistry + LocalToolRuntime (capability/tool layer).
 * 4. Create ModuleRegistry (module lifecycle management).
 * 5. Connect the runtime client.
 * 6. Activate all modules in registration order.
 *    - Each successful activation emits ModuleActivated.
 *    - Each failed activation emits ModuleCrashed.
 * 7. Optionally register the terminal capability (when AIRI_ENABLE_TERMINAL=1).
 *
 * Shutdown (reverse order):
 * 1. Close the terminal bridge (if registered).
 * 2. Deactivate all modules in reverse registration order.
 * 3. Disconnect the runtime client.
 *
 * The bootstrap function returns a CoreInstance handle that exposes
 * the registry, bus, runtime, and lifecycle methods.
 */

import type { ModuleActivated, ModuleCrashed } from './events/types.js'
import type { CoreContext } from './modules/module.js'
import type { ActivationResult } from './modules/registry.js'
import type { RuntimeClient } from './runtime/client.js'

import process from 'node:process'

import { CapabilityRegistry } from './capabilities/registry.js'
import { EventBus } from './events/bus.js'
import { createLogger } from './logger.js'
import { ModuleRegistry } from './modules/registry.js'
import { createLocalRuntimeClient } from './runtime/local-client.js'
import { LocalToolRuntime } from './runtime/local-tool-runtime.js'

// ── Types ────────────────────────────────────────────────────────────

/**
 * Handle returned by bootstrap(). Provides access to all core subsystems
 * and lifecycle management.
 */
export interface CoreInstance {
  /** The event bus for inter-module communication. */
  readonly events: EventBus

  /** The runtime client for external communication. */
  readonly runtime: RuntimeClient

  /** The capability registry managing all registered capabilities. */
  readonly capabilities: CapabilityRegistry

  /** The local tool runtime for dispatching tool invocations. */
  readonly toolRuntime: LocalToolRuntime

  /** The module registry managing all modules. */
  readonly registry: ModuleRegistry

  /** Activation result from the last bootstrap. */
  readonly activationResult: ActivationResult | null

  /**
   * Gracefully shut down the core:
   * - Close the terminal bridge (if registered).
   * - Deactivate modules in reverse order.
   * - Disconnect the runtime client.
   */
  shutdown: () => Promise<void>
}

// ── Bootstrap ────────────────────────────────────────────────────────

/**
 * Bootstrap the AIRI core subsystem.
 *
 * Creates all core components, connects
 * the runtime, and activates all modules in deterministic order.
 *
 * @returns A CoreInstance handle for lifecycle management.
 *
 * @example
 * ```ts
 * const core = await bootstrap()
 *
 * // Access subsystems
 * core.events.on("task.started", handleTask)
 * core.registry.isActive("my-module") // true
 *
 * // Shutdown
 * await core.shutdown()
 * ```
 */

export async function bootstrap(): Promise<CoreInstance> {
  const logger = createLogger('core')

  // ── Phase 1: Create EventBus ──────────────────────────────────────
  logger.info('Phase 1: Initializing EventBus...')
  const events = new EventBus()

  // ── Phase 2: Create RuntimeClient ──────────────────────────────────
  logger.info('Phase 2: Initializing RuntimeClient...')
  const runtime = createLocalRuntimeClient(events)

  // ── Phase 3: Create CapabilityRegistry + LocalToolRuntime ──────────────────────────────────
  logger.info('Phase 3: Initializing CapabilityRegistry + LocalToolRuntime...')
  const capabilities = new CapabilityRegistry()
  const toolRuntime = new LocalToolRuntime(capabilities, events)

  // ── Phase 4: Create ModuleRegistry ────────────────────────────────
  logger.info('Phase 4: Initializing ModuleRegistry...')
  const registry = new ModuleRegistry()

  // ── Phase 5: Connect runtime ──────────────────────────────────────
  logger.info('Phase 5: Connecting runtime...')
  await runtime.connect()
  logger.info(`Runtime connected (state: ${runtime.state})`)

  // ── Phase 6: Activate modules ──────────────────────────────────────
  logger.info('Phase 6: Activating modules...')

  const activationResult = await activateAllModules(registry, events, runtime, logger, capabilities, toolRuntime)

  const succeeded = activationResult.succeeded
  const failed = activationResult.failed
  const total = activationResult.total

  logger.info(`Activation complete: ${succeeded}/${total} succeeded, ${failed} failed.`)

  if (failed > 0) {
    for (const r of activationResult.results) {
      if (r.state === 'error') {
        logger.error(`Module "${r.id}" failed: ${r.error}`)
      }
    }
  }

  // ── Phase 7: Optional terminal capability (AIRI_ENABLE_TERMINAL=1) ──
  let terminalRegistration: { bridge: { close: () => Promise<void> } } | undefined
  if (process.env.AIRI_ENABLE_TERMINAL === '1') {
    logger.info('Phase 7: Registering terminal capability...')
    try {
      const { tryRegisterTerminalCapability } = await import('@proj-airi/core-terminal/runtime-entrypoint')
      const result = await tryRegisterTerminalCapability({ registry: capabilities, runtime: toolRuntime })
      if (result) {
        terminalRegistration = { bridge: result.bridge as { close: () => Promise<void> } }
        logger.info(`Terminal capability registered with ${result.toolIds.length} tools.`)
      }
      else {
        logger.info('Terminal capability disabled (no registration returned).')
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to register terminal capability: ${message}`)
      // Degrade gracefully — terminal is optional.
    }
  }

  // ── Return handle ─────────────────────────────────────────────────
  return {
    events,
    runtime,
    capabilities,
    toolRuntime,
    registry,
    activationResult,

    async shutdown(): Promise<void> {
      // Close terminal bridge first (if registered).
      if (terminalRegistration) {
        logger.info('Shutdown: Closing terminal bridge...')
        try {
          await terminalRegistration.bridge.close()
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn(`Error closing terminal bridge: ${message}`)
        }
      }

      logger.info('Shutdown: Deactivating modules...')
      await registry.deactivateAll()

      logger.info('Shutdown: Clearing capability registry...')
      capabilities.clear()

      logger.info('Shutdown: Disconnecting runtime...')
      await runtime.disconnect()

      logger.info('Shutdown complete.')
    },
  }
}

// ── Private ──────────────────────────────────────────────────────────

/**
 * Activate all modules with lifecycle event emission.
 *
 * Calls registry.activateAll() with a shared CoreContext, then emits
 * ModuleActivated / ModuleCrashed events based on the results.
 *
 * Note: The CoreContext.moduleId is set to the core bootstrapper id.
 * Individual modules already know their own id (via their `id` property)
 * and use it for logging. The moduleId in the context is a convenience
 * for modules that don't store their own id.
 */
async function activateAllModules(
  registry: ModuleRegistry,
  events: EventBus,
  runtime: RuntimeClient,
  logger: ReturnType<typeof createLogger>,
  capabilities: CapabilityRegistry,
  toolRuntime: LocalToolRuntime,
): Promise<ActivationResult> {
  const ctx: CoreContext = {
    moduleId: 'core',
    events,
    runtime,
    capabilities,
    toolRuntime,
    logger,
  }

  const result = await registry.activateAll(ctx)

  // Emit lifecycle events based on results.
  for (const r of result.results) {
    const module = registry.get(r.id)

    if (r.state === 'active') {
      const event: ModuleActivated = {
        type: 'module.activated',
        timestamp: new Date().toISOString(),
        source: 'core',
        moduleId: r.id,
        moduleName: module?.name ?? r.id,
      }
      events.emit('module.activated', event)
      logger.info(`Module "${r.id}" activated.`)
    }
    else {
      const event: ModuleCrashed = {
        type: 'module.crashed',
        timestamp: new Date().toISOString(),
        source: 'core',
        moduleId: r.id,
        moduleName: module?.name ?? r.id,
        error: r.error ?? 'Unknown error',
        recovered: false,
      }
      events.emit('module.crashed', event)
      logger.error(`Module "${r.id}" crashed: ${r.error}`)
    }
  }

  return result
}
