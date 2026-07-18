import { errorMessageFrom } from '@moeru/std'
import { onScopeDispose } from 'vue'

import {
  getSpeechBusContext,
  speechIntentCancelEvent,
  speechIntentEndEvent,
  speechIntentStartEvent,
} from '../services/speech/bus'
import { useAnalytics } from './use-analytics'

/**
 * Forwards `speechIntent*` lifecycle events from the cross-window speech
 * bus into PostHog `tts_intent_started/ended/cancelled`.
 *
 * Use when:
 * - Each app shell boots. Mount exactly once per window — the bus is a
 *   module singleton, so duplicate mounts double-count.
 *
 * Expects:
 * - Called inside a Vue effect scope so `onScopeDispose` can clean up.
 *
 * Per-token events (`literal` / `special` / `flush`) are deliberately
 * skipped: hot path, no analytical value, would torch PostHog quota.
 */
export function useSpeechPipelineAnalytics() {
  const { trackTtsIntentStarted, trackTtsIntentEnded, trackTtsIntentCancelled } = useAnalytics()
  const ctx = getSpeechBusContext()

  // Intents that never end (process killed mid-response) leak entries
  // until the window unloads — fine for a per-session in-memory map.
  const intentStartedAt = new Map<string, number>()

  const disposers: Array<() => void> = []

  function safeForward(label: string, fn: () => void) {
    try {
      fn()
    }
    catch (err) {
      console.warn(`[speech-pipeline-analytics] ${label} forward failed:`, errorMessageFrom(err))
    }
  }

  disposers.push(ctx.on(speechIntentStartEvent, (evt) => {
    const payload = evt?.body
    if (!payload?.intentId)
      return
    intentStartedAt.set(payload.intentId, Date.now())
    safeForward('intent-start', () => {
      trackTtsIntentStarted({ intent_id: payload.intentId, turn_id: payload.turnId })
    })
  }))

  disposers.push(ctx.on(speechIntentEndEvent, (evt) => {
    const payload = evt?.body
    if (!payload?.intentId)
      return
    const startedAt = intentStartedAt.get(payload.intentId)
    intentStartedAt.delete(payload.intentId)
    safeForward('intent-end', () => {
      trackTtsIntentEnded({
        intent_id: payload.intentId,
        turn_id: payload.turnId,
        duration_ms: startedAt ? Date.now() - startedAt : 0,
      })
    })
  }))

  disposers.push(ctx.on(speechIntentCancelEvent, (evt) => {
    const payload = evt?.body
    if (!payload?.intentId)
      return
    intentStartedAt.delete(payload.intentId)
    safeForward('intent-cancel', () => {
      trackTtsIntentCancelled({
        intent_id: payload.intentId,
        turn_id: payload.turnId,
        reason: payload.reason,
      })
    })
  }))

  onScopeDispose(() => {
    for (const dispose of disposers) {
      try {
        dispose()
      }
      catch { /* swallow — disposers must not throw */ }
    }
    disposers.length = 0
    intentStartedAt.clear()
  })
}
