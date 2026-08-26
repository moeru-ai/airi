import type { Message } from '@xsai/shared-chat'

import type { LlmLogEntry } from './llm-log'

/**
 * Compact turn summary returned by history.turns().
 */
export interface TurnSummary {
  actionCount: number
  eventType: string
  hasError: boolean
  text: string
  turnId: number
}

interface HistoryQueryDeps {
  getConversationHistory: () => readonly Message[]
  getCurrentTurnId: () => number
  getLlmLogEntries: () => readonly LlmLogEntry[]
}

/**
 * Creates the `history` runtime object exposed to the REPL sandbox.
 * Provides search-oriented access to the in-memory conversation history.
 */
export function createHistoryRuntime(deps: HistoryQueryDeps) {
  return {
    /**
     * Total message count in the conversation history.
     */
    count(): number {
      return deps.getConversationHistory().length
    },

    /**
     * Current turn ID.
     */
    currentTurn(): number {
      return deps.getCurrentTurnId()
    },

    /**
     * Last N player chat messages extracted from conversation history.
     */
    playerChats(n = 5): string[] {
      const history = deps.getConversationHistory()
      const chats: string[] = []

      for (let i = history.length - 1; i >= 0 && chats.length < n; i--) {
        const msg = history[i]
        if (msg.role !== 'user' || typeof msg.content !== 'string')
          continue
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const match = msg.content.match(/\[EVENT\]\s*([^:\n]+:[^\n]+)/)
        if (match?.[1] && !match[1].startsWith('Perception Signal:')) {
          chats.unshift(match[1])
        }
      }

      return chats
    },

    /**
     * Last N user/assistant message pairs from conversation history.
     */
    recent(n = 5): Array<{ content: string, role: string }> {
      const history = deps.getConversationHistory()
      const pairs: Array<{ content: string, role: string }> = []

      // Walk backwards collecting user/assistant pairs
      for (let i = history.length - 1; i >= 0 && pairs.length < n * 2; i--) {
        const msg = history[i]
        if (msg.role === 'user' || msg.role === 'assistant') {
          pairs.unshift({
            content: typeof msg.content === 'string' ? msg.content : String(msg.content),
            role: msg.role,
          })
        }
      }

      return pairs.slice(-(n * 2))
    },

    /**
     * Text search across conversation history.
     * Returns matching messages with their role and a content snippet.
     */
    search(query: string, maxResults = 10): Array<{ content: string, role: string, source: 'conversation' }> {
      if (!query || typeof query !== 'string')
        return []

      const needle = query.toLowerCase()
      const results: Array<{ content: string, role: string, source: 'conversation' }> = []

      for (const msg of deps.getConversationHistory()) {
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
        if (content.toLowerCase().includes(needle)) {
          results.push({
            content: content.length > 300 ? `${content.slice(0, 297)}...` : content,
            role: msg.role,
            source: 'conversation',
          })
          if (results.length >= maxResults)
            return results
        }
      }

      return results
    },

    /**
     * Last N turn summaries from llmLog (turnId, event type, action count, errors).
     */
    turns(n = 10): TurnSummary[] {
      const entries = deps.getLlmLogEntries()
      const turnMap = new Map<number, TurnSummary>()

      // Build turn summaries from turn_input entries
      for (const entry of entries) {
        if (entry.kind !== 'turn_input')
          continue
        turnMap.set(entry.turnId, {
          actionCount: 0,
          eventType: entry.eventType,
          hasError: false,
          text: entry.text,
          turnId: entry.turnId,
        })
      }

      // Enrich with repl_result data
      for (const entry of entries) {
        if (entry.kind !== 'repl_result')
          continue
        const turn = turnMap.get(entry.turnId)
        if (!turn)
          continue
        const meta = entry.metadata as Record<string, unknown> | undefined
        if (meta) {
          turn.actionCount = typeof meta.actionCount === 'number' ? meta.actionCount : 0
          turn.hasError = (typeof meta.errorCount === 'number' && meta.errorCount > 0)
            || entry.tags.includes('error')
        }
      }

      // Also mark turns with repl_error
      for (const entry of entries) {
        if (entry.kind !== 'repl_error')
          continue
        const turn = turnMap.get(entry.turnId)
        if (turn)
          turn.hasError = true
      }

      const sorted = [...turnMap.values()].sort((a, b) => b.turnId - a.turnId)
      return sorted.slice(0, Math.max(1, Math.floor(n)))
    },
  }
}
