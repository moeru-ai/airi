import type { ChatStreamEventContext, TurnRef } from '@proj-airi/core-agent'
import type { Ref } from 'vue'

import { onScopeDispose, readonly, ref, watch } from 'vue'

/**
 * Owns the visible translation for one foreground turn. New turns and session changes invalidate old chunks.
 * The caption expires after ten seconds without a chunk. Expiry hides text but preserves the active turn.
 */
export function useTranslationCaption(activeSessionId: Readonly<Ref<string>>) {
  const text = ref('')
  let turn: TurnRef | undefined
  let accumulated = ''
  let expiry: ReturnType<typeof setTimeout> | undefined

  function hide() {
    clearTimeout(expiry)
    expiry = undefined
    text.value = ''
  }

  function clear() {
    turn = undefined
    accumulated = ''
    hide()
  }

  function matches(context: TurnRef) {
    return turn?.sessionId === context.sessionId && turn.turnId === context.turnId
      && context.sessionId === activeSessionId.value
  }

  function begin(context: Pick<ChatStreamEventContext, 'sessionId' | 'turnId' | 'speaks'>) {
    if (!context.speaks || context.sessionId !== activeSessionId.value)
      return
    clear()
    turn = { sessionId: context.sessionId, turnId: context.turnId }
  }

  function append(literal: string, context: TurnRef) {
    if (!matches(context))
      return
    // Empty chunks start a new translated segment after a tool round.
    accumulated = literal ? accumulated + literal : ''
    text.value = accumulated
    clearTimeout(expiry)
    expiry = setTimeout(hide, 10_000)
  }

  function cancel(context: TurnRef) {
    if (matches(context))
      clear()
  }

  watch(activeSessionId, clear, { flush: 'sync' })
  onScopeDispose(clear)
  return { text: readonly(text), begin, append, cancel, clear }
}
