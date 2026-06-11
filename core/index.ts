/**
 * AIRI Core — Public API
 *
 * Barrel export for all public core APIs. Import from `core/` to access
 * the event bus, runtime client, module registry, bootstrap, and logger.
 *
 * @example
 * ```ts
 * import { bootstrap, EventBus, createLogger } from '../core/index.js'
 * ```
 */

// ── Contracts (re-exported from existing files) ─────────────────────

export type {
	AiriModule,
	CoreContext,
	RuntimeClient as RuntimeClientContract,
} from "./modules/module.js"

export type {
	AiriEvent,
	AiriEventBase,
	TaskStarted,
	TaskCompleted,
	ToolCalled,
	ToolFinished,
	ModuleActivated,
	ModuleCrashed,
} from "./events/types.js"

export type {
	RuntimeConnectionState,
	RuntimeMessageHandler,
	RuntimeStateHandler,
} from "./runtime/client.js"

// ── Implementations ──────────────────────────────────────────────────

export { EventBus } from "./events/bus.js"
export type { UnsubscribeFn } from "./events/bus.js"

export { createLocalRuntimeClient } from "./runtime/local-client.js"
export { LocalRuntimeClient } from "./runtime/local-client.js"

export { ModuleRegistry } from "./modules/registry.js"
export type {
	ModuleRegistryOptions,
	ActivationResult,
	ModuleActivationResult,
} from "./modules/registry.js"

export { createLogger, setLogLevel, getLogLevel } from "./logger.js"
export type { Logger, LogLevel } from "./logger.js"

export { bootstrap } from "./bootstrap.js"
export type { CoreInstance } from "./bootstrap.js"
