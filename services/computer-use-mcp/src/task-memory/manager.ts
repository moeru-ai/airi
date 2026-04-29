// ---------------------------------------------------------------------------
// TaskMemoryManager — owns the in-memory task memory state for one session.
//
// Concurrency:
//   Each session has exactly one TaskMemoryManager.
//   Multiple concurrent updates are serialised via (sourceTurnId, sourceTurnIndex).
//   Late / stale updates are silently dropped.
// ---------------------------------------------------------------------------

import type { TaskMemory, TaskMemoryExtraction, TaskMemoryUpdateSource } from './types'

import { createEmptyTaskMemory, hasMeaningfulTaskMemoryExtraction, isTaskMemoryVisible, mergeTaskMemory } from './merge'

export type TaskMemoryUpdateResult
  = | { status: 'updated', taskMemory: TaskMemory }
    | { status: 'ignored-empty' }
    | { status: 'ignored-stale', latestSourceTurnId?: string, latestSourceTurnIndex?: number }

export class TaskMemoryManager {
  private current: TaskMemory | undefined
  /** The latest completed turn observed by the manager, even if it produced no visible write. */
  private latestSeenTurnId: string | undefined
  /** Monotonic turn index of the latest observed completed turn. */
  private latestSeenTurnIndex: number | undefined

  /** Get current task memory (may be undefined if no task in progress). */
  get(): TaskMemory | undefined {
    return this.current
  }

  /** Whether the current memory has displayable content. */
  isVisible(): boolean {
    return isTaskMemoryVisible(this.current)
  }

  /**
   * Apply an extraction via validated merge.
   *
   * Returns a structured outcome so callers can distinguish stale writes
   * from empty updates without surfacing either as hard failures.
   */
  update(extraction: TaskMemoryExtraction, source: TaskMemoryUpdateSource): TaskMemoryUpdateResult {
    const { sourceTurnId, sourceTurnIndex } = source

    if (this.latestSeenTurnIndex !== undefined) {
      if (sourceTurnIndex < this.latestSeenTurnIndex) {
        return {
          status: 'ignored-stale',
          latestSourceTurnId: this.latestSeenTurnId,
          latestSourceTurnIndex: this.latestSeenTurnIndex,
        }
      }

      if (sourceTurnIndex === this.latestSeenTurnIndex && this.latestSeenTurnId && this.latestSeenTurnId !== sourceTurnId) {
        return {
          status: 'ignored-stale',
          latestSourceTurnId: this.latestSeenTurnId,
          latestSourceTurnIndex: this.latestSeenTurnIndex,
        }
      }
    }

    this.latestSeenTurnId = sourceTurnId
    this.latestSeenTurnIndex = sourceTurnIndex

    if (!hasMeaningfulTaskMemoryExtraction(extraction))
      return { status: 'ignored-empty' }

    const merged = mergeTaskMemory({
      existing: this.current,
      extraction,
      sourceTurnId,
    })

    if (!isTaskMemoryVisible(merged))
      return { status: 'ignored-empty' }

    this.current = merged
    return { status: 'updated', taskMemory: merged }
  }

  /**
   * Reset task memory (e.g. on session clear or explicit user action).
   */
  clear(): void {
    this.current = undefined
    this.latestSeenTurnId = undefined
    this.latestSeenTurnIndex = undefined
  }

  /**
   * Initialise with a fresh skeleton for a given turn.
   */
  init(source: TaskMemoryUpdateSource): TaskMemory {
    const { sourceTurnId, sourceTurnIndex } = source
    this.current = createEmptyTaskMemory(sourceTurnId)
    this.latestSeenTurnId = sourceTurnId
    this.latestSeenTurnIndex = sourceTurnIndex
    return this.current
  }

  /**
   * Generate a human-readable source description.
   */
  getSourceDescription(): string | null {
    if (!this.current)
      return null
    const age = Date.now() - this.current.updatedAt
    if (age < 10_000)
      return 'Updated just now'
    if (age < 60_000)
      return 'Updated after latest completed turn'
    return 'Updated after tool execution'
  }

  /**
   * Produce a compact text snapshot suitable for MCP resource content or
   * system prompt injection.
   */
  toContextString(): string {
    const tm = this.current
    if (!tm)
      return '(no active task memory)'

    const lines: string[] = []
    lines.push(`Status: ${tm.status}`)
    if (tm.goal)
      lines.push(`Goal: ${tm.goal}`)
    if (tm.currentStep)
      lines.push(`Current step: ${tm.currentStep}`)
    if (tm.confirmedFacts.length > 0)
      lines.push(`Confirmed facts:\n${tm.confirmedFacts.map(f => `  - ${f}`).join('\n')}`)
    if (tm.artifacts.length > 0)
      lines.push(`Artifacts:\n${tm.artifacts.map(a => `  - [${a.kind}] ${a.label}: ${a.value}`).join('\n')}`)
    if (tm.blockers.length > 0)
      lines.push(`Blockers:\n${tm.blockers.map(b => `  - ${b}`).join('\n')}`)
    if (tm.nextStep)
      lines.push(`Next step: ${tm.nextStep}`)
    if (tm.plan && tm.plan.length > 0)
      lines.push(`Plan:\n${tm.plan.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`)
    if (tm.workingAssumptions && tm.workingAssumptions.length > 0)
      lines.push(`Working assumptions:\n${tm.workingAssumptions.map(a => `  - ${a}`).join('\n')}`)
    if (tm.recentFailureReason)
      lines.push(`Recent failure: ${tm.recentFailureReason}`)
    if (tm.completionCriteria && tm.completionCriteria.length > 0)
      lines.push(`Completion criteria:\n${tm.completionCriteria.map(c => `  - ${c}`).join('\n')}`)

    return lines.join('\n')
  }
}
