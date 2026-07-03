/**
 * AIRI Core — Decision Memory
 *
 * Records and queries decisions made during plan generation or execution.
 * Decisions are explicit and deterministic — no AI reasoning.
 *
 * Design decisions:
 * - Decisions are immutable after recording.
 * - Stats are computed on-demand from stored records.
 * - Outcome tracking links decisions to actual results.
 */

import type { DecisionRecord, MemoryId } from './types.js'
import { createMemoryId } from './types.js'

// ── DecisionMemory ────────────────────────────────────────────────────────

/**
 * Records and queries decisions made during plan generation or execution.
 */
export class DecisionMemory {
  private readonly decisions: Map<MemoryId, DecisionRecord> = new Map()

  /**
   * Record a decision.
   *
   * Decisions are immutable after recording. Use updateDecision to
   * add outcomes after the fact.
   */
  recordDecision(decision: DecisionRecord): void {
    this.decisions.set(decision.id, decision)
  }

  /**
   * Get decisions, optionally filtered.
   */
  getDecisions(filter?: {
    proposalId?: string
    planId?: string
    type?: string
  }): DecisionRecord[] {
    const decisions = Array.from(this.decisions.values())

    if (!filter)
      return decisions

    return decisions.filter((d) => {
      if (filter.proposalId && d.proposalId !== filter.proposalId)
        return false
      if (filter.planId && d.planId !== filter.planId)
        return false
      if (filter.type && d.type !== filter.type)
        return false
      return true
    })
  }

  /**
   * Get decision statistics.
   */
  getDecisionStats(): {
    total: number
    accepted: number
    rejected: number
    revised: number
  } {
    const decisions = Array.from(this.decisions.values())

    return {
      total: decisions.length,
      accepted: decisions.filter(d => d.type === 'accepted').length,
      rejected: decisions.filter(d => d.type === 'rejected').length,
      revised: decisions.filter(d => d.type === 'revised').length,
    }
  }

  /**
   * Get outcomes for a specific proposal.
   *
   * Returns all decisions associated with a proposal, showing what
   * actually happened after the decision was made.
   */
  getOutcomes(proposalId: string): DecisionRecord[] {
    return Array.from(this.decisions.values()).filter(
      d => d.proposalId === proposalId,
    )
  }

  /**
   * Get validation history for a proposal.
   *
   * Returns decisions that have validation results, showing the
   * validation outcomes for a specific proposal.
   */
  getValidationHistory(proposalId: string): DecisionRecord[] {
    return Array.from(this.decisions.values()).filter(
      (d) => {
        const matchesProposal = d.proposalId === proposalId
        return matchesProposal && d.validationResult !== undefined
      },
    )
  }

  /**
   * Update a decision with an outcome.
   *
   * Returns the updated decision, or undefined if not found.
   */
  updateDecision(
    id: MemoryId,
    outcome: string,
  ): DecisionRecord | undefined {
    const existing = this.decisions.get(id)
    if (!existing)
      return undefined

    const updated: DecisionRecord = {
      ...existing,
      outcome,
    }

    this.decisions.set(id, updated)
    return updated
  }

  /**
   * Get all decisions as an array.
   */
  list(): DecisionRecord[] {
    return Array.from(this.decisions.values())
  }

  /**
   * Get the total number of decisions.
   */
  count(): number {
    return this.decisions.size
  }

  /**
   * Remove all decisions.
   */
  clear(): void {
    this.decisions.clear()
  }

  // ── Test helpers ─────────────────────────────────────────────────────

  /**
   * Generate a unique decision ID.
   */
  static generateId(prefix = 'decision'): MemoryId {
    return createMemoryId(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }
}
