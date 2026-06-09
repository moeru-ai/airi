/**
 * AIRI Module Registry
 *
 * Manages the full lifecycle of AIRI modules: registration, activation,
 * deactivation, and lazy-loading stubs.
 *
 * Design decisions:
 * - Class-based (not a global singleton). The AIRI core creates one registry
 *   instance and passes it where needed. This keeps the system testable and
 *   avoids hidden global state.
 * - Lazy-loading is supported via factory functions. A module can be registered
 *   as a () => Promise<AiriModule> so that its code is only loaded when first
 *   activated. This keeps startup fast for large module sets.
 * - Activation order is deterministic: modules activate in registration order.
 */

import type { AiriModule, CoreContext } from "./module.js"

/**
 * A registered module entry. Stores either a direct module instance or a
 * lazy-loading factory, plus activation state.
 */
interface ModuleEntry {
	module: AiriModule | null
	factory: (() => Promise<AiriModule>) | null
	state: "registered" | "activating" | "active" | "deactivating" | "error"
	error?: string
}

/**
 * Options for ModuleRegistry construction.
 */
export interface ModuleRegistryOptions {
	/**
	 * Maximum time (ms) to wait for a single module's activate() before
	 * treating it as a failure and moving on.
	 *
	 * @default 30_000
	 */
	activationTimeout?: number
}

/**
 * Manages AIRI module registration and lifecycle.
 *
 * Usage:
 * ```ts
 * const registry = new ModuleRegistry()
 *
 * // Direct registration
 * registry.register(myModule)
 *
 * // Lazy registration (loaded on first activateAll)
 * registry.registerLazy(() => import("./heavy-module.js").then(m => m.default))
 *
 * await registry.activateAll(ctx)
 * ```
 */
export class ModuleRegistry {
	private readonly entries = new Map<string, ModuleEntry>()

	private readonly activationTimeout: number

	constructor(options: ModuleRegistryOptions = {}) {
		this.activationTimeout = options.activationTimeout ?? 30_000
	}

	/**
	 * Register a module instance directly.
	 *
	 * @throws If a module with the same id is already registered.
	 */
	register(module: AiriModule): void {
		if (this.entries.has(module.id)) {
			throw new Error(`Module "${module.id}" is already registered.`)
		}

		this.entries.set(module.id, {
			module,
			factory: null,
			state: "registered",
		})
	}

	/**
	 * Register a module via a lazy factory function.
	 *
	 * The factory is called once on activateAll(). This defers the import
	 * cost until the module is actually needed.
	 *
	 * @throws If a module with the same id is already registered.
	 */
	registerLazy(factory: () => Promise<AiriModule>, id?: string): void {
		// We need an id upfront. If not provided, we extract it from the
		// factory's result on first call. For now we require it.
		if (!id) {
			throw new Error("registerLazy requires an explicit module id.")
		}

		if (this.entries.has(id)) {
			throw new Error(`Module "${id}" is already registered.`)
		}

		this.entries.set(id, {
			module: null,
			factory,
			state: "registered",
		})
	}

	/**
	 * Activate all registered modules in registration order.
	 *
	 * Each module's activate() is called with the provided context.
	 * If a module fails to activate, the error is recorded and activation
	 * continues with the next module. This prevents one broken module from
	 * taking down the entire system.
	 *
	 * @param ctx - The core context to pass to each module.
	 * @returns A summary of activation results.
	 */
	async activateAll(ctx: CoreContext): Promise<ActivationResult> {
		const results: ModuleActivationResult[] = []

		for (const [id, entry] of this.entries) {
			const result = await this.activateOne(id, entry, ctx)
			results.push(result)
		}

		return {
			total: results.length,
			succeeded: results.filter((r) => r.state === "active").length,
			failed: results.filter((r) => r.state === "error").length,
			results,
		}
	}

	/**
	 * Deactivate all currently active modules in reverse registration order.
	 *
	 * Deactivation is best-effort: failures are logged but do not prevent
	 * other modules from deactivating.
	 */
	async deactivateAll(): Promise<void> {
		const entries = [...this.entries.entries()].reverse()

		for (const [id, entry] of entries) {
			if (entry.state !== "active") continue
			if (!entry.module?.deactivate) continue

			entry.state = "deactivating"

			try {
				await entry.module.deactivate()
				entry.state = "registered"
			} catch (error) {
				entry.state = "error"
				entry.error = error instanceof Error ? error.message : String(error)
				// Best-effort: continue deactivating other modules.
			}
		}
	}

	/**
	 * Get a module by id, or undefined if not registered.
	 */
	get(id: string): AiriModule | undefined {
		return this.entries.get(id)?.module ?? undefined
	}

	/**
	 * Return all registered module ids.
	 */
	ids(): string[] {
		return [...this.entries.keys()]
	}

	/**
	 * Check whether a module is currently active.
	 */
	isActive(id: string): boolean {
		return this.entries.get(id)?.state === "active"
	}

	// ── Private ────────────────────────────────────────────────────────

	private async activateOne(
		id: string,
		entry: ModuleEntry,
		ctx: CoreContext,
	): Promise<ModuleActivationResult> {
		try {
			// Resolve lazy modules.
			if (entry.factory && !entry.module) {
				entry.state = "activating"
				entry.module = await entry.factory()
			}

			if (!entry.module) {
				throw new Error("Module is null after factory resolution.")
			}

			entry.state = "activating"

			// Wrap activation in a timeout to prevent hung modules.
			await this.withTimeout(entry.module.activate(ctx), this.activationTimeout, id)

			entry.state = "active"

			return { id, state: "active" }
		} catch (error) {
			entry.state = "error"
			entry.error = error instanceof Error ? error.message : String(error)

			return { id, state: "error", error: entry.error }
		}
	}

	private withTimeout<T>(promise: Promise<T>, ms: number, moduleId: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`Module "${moduleId}" activation timed out after ${ms}ms.`))
			}, ms)

			promise.then(
				(val) => {
					clearTimeout(timer)
					resolve(val)
				},
				(err) => {
					clearTimeout(timer)
					reject(err)
				},
			)
		})
	}
}

// ── Result types ──────────────────────────────────────────────────────

export interface ModuleActivationResult {
	id: string
	state: "active" | "error"
	error?: string
}

export interface ActivationResult {
	total: number
	succeeded: number
	failed: number
	results: ModuleActivationResult[]
}
