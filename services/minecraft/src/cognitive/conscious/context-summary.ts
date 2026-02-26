import type { Message } from '@xsai/shared-chat'

import type { LlmLogEntry } from './llm-log'

/**
 * Archived context boundary produced by exitContext().
 * Each entry represents a completed task block whose messages have been
 * removed from the active conversation history and replaced by this summary.
 */
export interface ArchivedContext {
  label: string
  summary: string
  startTurnId: number
  endTurnId: number
  messageCount: number
  archivedAt: number
}

/**
 * Tracks the currently active context boundary.
 */
export interface ActiveContextState {
  label: string | null
  startTurnId: number
  startedAt: number
}

interface ContextSummaryInput {
  messages: Message[]
  label: string | null
  llmLogEntries: readonly LlmLogEntry[]
  startTurnId: number
  endTurnId: number
}

const MAX_SUMMARY_ACTIONS = 5
const MAX_SUMMARY_LENGTH = 600

/**
 * Generate a deterministic heuristic summary from a block of conversation
 * messages and their associated llmLog entries. No LLM call is made.
 *
 * The summary captures:
 * - Context label (if provided via enterContext)
 * - The triggering player instruction (if any)
 * - Action sequence with outcomes
 * - Turn count
 */
export function generateContextSummary(input: ContextSummaryInput): string {
  const { messages, label, llmLogEntries, startTurnId, endTurnId } = input

  const parts: string[] = []

  // Label
  if (label) {
    parts.push(`Task: ${label}`)
  }

  // Find the first player chat message in this context block
  const playerInstruction = findPlayerInstruction(messages)
  if (playerInstruction) {
    parts.push(`Trigger: ${truncate(playerInstruction, 120)}`)
  }

  // Extract action outcomes from llmLog entries within this turn range
  const actions = extractActionSummaries(llmLogEntries, startTurnId, endTurnId)
  if (actions.length > 0) {
    const actionLines = actions.slice(0, MAX_SUMMARY_ACTIONS).map(a => `  ${a}`)
    parts.push(`Actions:\n${actionLines.join('\n')}`)
  }

  // Turn count
  const turnCount = endTurnId - startTurnId + 1
  parts.push(`Turns: ${turnCount} (${startTurnId}–${endTurnId})`)

  const result = parts.join('\n')
  return truncate(result, MAX_SUMMARY_LENGTH)
}

/**
 * Build the [CONTEXT_HISTORY] message content from archived context summaries.
 * Returns null if there are no archived contexts.
 */
export function buildContextHistoryMessage(archives: readonly ArchivedContext[]): string | null {
  if (archives.length === 0)
    return null

  const sections = archives.map((ctx, i) => {
    const header = `[${i + 1}] ${ctx.label || 'unnamed'}`
    return `${header}\n${ctx.summary}`
  })

  return `[CONTEXT_HISTORY] Completed task summaries (${archives.length}):\n\n${sections.join('\n\n')}`
}

/**
 * Collapse the oldest N archived contexts into a single meta-summary.
 * Used when the number of archived contexts exceeds the prefix limit.
 */
export function collapseOldestContexts(
  archives: ArchivedContext[],
  collapseCount: number,
): ArchivedContext[] {
  if (collapseCount <= 0 || archives.length <= collapseCount)
    return archives

  const toCollapse = archives.slice(0, collapseCount)
  const remaining = archives.slice(collapseCount)

  const labels = toCollapse
    .map(ctx => ctx.label || 'unnamed')
    .join(', ')

  const totalMessages = toCollapse.reduce((sum, ctx) => sum + ctx.messageCount, 0)
  const totalTurns = toCollapse.reduce((sum, ctx) => sum + (ctx.endTurnId - ctx.startTurnId + 1), 0)

  const collapsed: ArchivedContext = {
    label: `(collapsed: ${labels})`,
    summary: `Collapsed ${toCollapse.length} earlier contexts (${totalTurns} turns, ${totalMessages} messages). Topics: ${labels}.`,
    startTurnId: toCollapse[0].startTurnId,
    endTurnId: toCollapse[toCollapse.length - 1].endTurnId,
    messageCount: totalMessages,
    archivedAt: Date.now(),
  }

  return [collapsed, ...remaining]
}

// --- Helpers ---

function findPlayerInstruction(messages: Message[]): string | null {
  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content !== 'string')
      continue
    // Player chat events are formatted as "[EVENT] <player> whispered: ..." or "[EVENT] <player>: ..."
    const match = msg.content.match(/\[EVENT\]\s*(?:<\w+>|\w+)\s*(?:whispered:|:)\s*(.+)/i)
    if (match?.[1])
      return match[1].trim()
  }
  return null
}

function extractActionSummaries(
  entries: readonly LlmLogEntry[],
  startTurnId: number,
  endTurnId: number,
): string[] {
  const summaries: string[] = []

  for (const entry of entries) {
    if (entry.turnId < startTurnId || entry.turnId > endTurnId)
      continue

    // Capture action queue results (success/failure)
    if (entry.kind === 'scheduler' && entry.tags.includes('action_queue')) {
      if (entry.tags.includes('success') || entry.tags.includes('failure')) {
        const tool = entry.tags.find(t => !['scheduler', 'action_queue', 'success', 'failure'].includes(t)) ?? '?'
        const status = entry.tags.includes('success') ? 'ok' : 'fail'
        summaries.push(`${tool}: ${status}`)
      }
    }

    // Capture direct repl_result action summaries
    if (entry.kind === 'repl_result' && entry.metadata) {
      const meta = entry.metadata as Record<string, unknown>
      const actions = meta.actions as Array<{ tool: string, ok: boolean }> | undefined
      if (actions && Array.isArray(actions)) {
        for (const action of actions) {
          if (action.tool === 'skip')
            continue
          summaries.push(`${action.tool}: ${action.ok ? 'ok' : 'fail'}`)
        }
      }
    }
  }

  return summaries
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`
}
