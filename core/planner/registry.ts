/**
 * AIRI Core — Plan Registry
 *
 * Manages plan definitions and runtime plan instances.
 * No global singletons — instantiate per daemon.
 *
 * Design decisions:
 * - In-memory storage (plans are ephemeral, tied to daemon lifecycle).
 * - Duplicate ID detection on registration.
 * - Filtered listing for status-based queries.
 */

import type { Plan, PlanFilter, PlanStatus } from "./types.js"

// ── Plan Registry ─────────────────────────────────────────────────────────

/**
 * Manages plan definitions and runtime plan instances.
 */
export class PlanRegistry {
	private readonly plans = new Map<string, Plan>()

	/**
	 * Register a plan. Throws if a plan with the same ID already exists.
	 */
	register(plan: Plan): void {
		if (this.plans.has(plan.id as string)) {
			throw new Error(`Plan already registered: ${plan.id}`)
		}
		this.plans.set(plan.id as string, plan)
	}

	/**
	 * Retrieve a plan by ID.
	 */
	get(planId: string): Plan | undefined {
		return this.plans.get(planId)
	}

	/**
	 * List all plans, optionally filtered.
	 */
	list(filter: PlanFilter = {}): Plan[] {
		const results: Plan[] = []
		for (const [, plan] of this.plans) {
			if (filter.status && plan.status !== filter.status) continue
			if (filter.sessionId && plan.sessionId !== filter.sessionId) continue
			if (filter.name && plan.name !== filter.name) continue
			results.push(plan)
		}
		return results
	}

	/**
	 * Update a plan (e.g. for status changes).
	 */
	update(plan: Plan): void {
		if (!this.plans.has(plan.id as string)) {
			throw new Error(`Plan not found: ${plan.id}`)
		}
		this.plans.set(plan.id as string, plan)
	}

	/**
	 * Remove a plan by ID.
	 */
	remove(planId: string): boolean {
		return this.plans.delete(planId)
	}

	/**
	 * Get all plans with a given status.
	 */
	getByStatus(status: PlanStatus): Plan[] {
		return this.list({ status })
	}

	/**
	 * Number of registered plans.
	 */
	get size(): number {
		return this.plans.size
	}
}
