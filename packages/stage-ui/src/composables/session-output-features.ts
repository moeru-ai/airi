import type { ChatStreamEventContext } from '@proj-airi/core-agent'

import { onScopeDispose, watch } from 'vue'

import { useChatSessionStore } from '../stores/chat/session-store'

/** Output consumers share turn ownership without requiring a composed provider prompt. */
export type SessionOutputContext = Pick<ChatStreamEventContext, 'sessionId' | 'turnId' | 'speaks' | 'reactions'>

/**
 * Admits output from each turn's snapshot and applies live revocation from session choices.
 * A stopped speech producer cannot resume within that turn. Disposal releases the host's local turn state.
 */
export function useSessionOutputFeatures(stopSpeech: (turn: SessionOutputContext) => void) {
  const sessions = useChatSessionStore()
  const turns = new Map<string, SessionOutputContext>()
  const suppressedSpeech = new Set<string>()
  const keyOf = (turn: Pick<SessionOutputContext, 'sessionId' | 'turnId'>) => JSON.stringify([turn.sessionId, turn.turnId])

  function begin(turn: SessionOutputContext) {
    turns.set(keyOf(turn), turn)
  }

  function end(turn: SessionOutputContext) {
    turns.delete(keyOf(turn))
    suppressedSpeech.delete(keyOf(turn))
  }

  function canSpeak(turn: SessionOutputContext) {
    return turn.speaks === true && !suppressedSpeech.has(keyOf(turn))
      && sessions.sessionFeatures[turn.sessionId]?.speech === true
  }

  function canReact(turn: SessionOutputContext) {
    return turn.reactions === true && sessions.sessionFeatures[turn.sessionId]?.reactions === true
  }

  function canReactFor(turnId: string, sessionId?: string) {
    const turn = sessionId ? turns.get(keyOf({ sessionId, turnId })) : undefined
    return turn !== undefined && canReact(turn)
  }

  watch(() => sessions.sessionFeatures, () => {
    for (const turn of turns.values()) {
      const key = keyOf(turn)
      if (turn.speaks && !suppressedSpeech.has(key) && sessions.sessionFeatures[turn.sessionId]?.speech !== true) {
        suppressedSpeech.add(key)
        stopSpeech(turn)
      }
    }
  }, { flush: 'sync' })

  onScopeDispose(() => {
    turns.clear()
    suppressedSpeech.clear()
  })

  return { begin, end, canSpeak, canReact, canReactFor }
}
