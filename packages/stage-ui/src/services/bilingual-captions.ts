import type { TokenTranslationPayload } from '@proj-airi/core-agent'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { BILINGUAL_LANGUAGES } from '@proj-airi/pipelines-audio'

import { createBilingualCaptionTracker } from '../composables/use-bilingual-captions'

/** Minimal playback item shape the tracker needs from either TTS transport. */
export interface BilingualCaptionPlaybackItem {
  /** Turn id stamped on REST pipeline items. */
  turnId?: string
  /** Intent id used to resolve streaming items that lack a turn id. */
  intentId: string
}

export interface BilingualCaptionBus {
  /** Maps a streaming TTS intent (no item turnId) back to its chat turn. */
  mapIntentToTurn: (intentId: string, turnId: string) => void
  /** Opens the pair that the next spoken fragments belong to. */
  ingestSpoken: (turnId: string) => void
  /** Stores a translated fragment and republishes when its pair is current. */
  ingestTranslation: (turnId: string, payload: TokenTranslationPayload) => void
  /** Reports one spoken sentence item started at a real boundary. */
  routePlaybackItem: (item: BilingualCaptionPlaybackItem) => void
  /** Reports one upstream sentence boundary from buffered streaming TTS. */
  advancePlayback: (turnId: string) => void
  /** Flushes leftover pairs once playback for one intent fully drained. */
  flushIntent: (intentId: string, turnId?: string) => void
  /** Flushes leftover pairs for one turn (no-audio / session-end fallback). */
  flushTurn: (turnId: string) => void
  /** Clears one turn and posts the event that clears its caption line. */
  resetTurn: (turnId: string) => void
  /** Clears every turn and posts the event that clears the caption line. */
  resetAll: () => void
}

/**
 * Reveal timing is anchored to the spoken sentence START: the
 * REST/non-buffered path calls in from a sentence item `onStart`, and the
 * buffered WebSocket path calls in from an upstream sentence boundary. The
 * translation line therefore changes with the spoken line, at any speech
 * rate and without a time offset.
 *
 * The poller runs only for the rare case where the sentence starts before
 * its translation finished streaming. The queue drains as soon as the text
 * arrives.
 */
const REVEAL_TICK_MS = 60

const labelsByCode = new Map<string, string>(BILINGUAL_LANGUAGES.map(language => [language.code, language.label]))

function createBus(): BilingualCaptionBus {
  const tracker = createBilingualCaptionTracker()
  const intentTurns = new Map<string, string>()
  // One reveal poller per turn.
  const revealTimers = new Map<string, ReturnType<typeof setInterval>>()

  let post: ((event: CaptionChannelEvent) => void) | undefined

  // Native channel instead of VueUse's useBroadcastChannel: VueUse creates
  // its channel inside tryOnMounted, which never runs when the first emit
  // happens from an async chat/TTS hook without a component scope. The
  // result is a `post` that silently no-ops, dropping every translation
  // event. The native constructor has no lifecycle requirement.
  function resolvePost(): ((event: CaptionChannelEvent) => void) | undefined {
    if (post)
      return post
    if (typeof BroadcastChannel === 'undefined')
      return undefined
    const channel = new BroadcastChannel('airi-caption-overlay')
    post = (event) => {
      try {
        channel.postMessage(event)
      }
      catch {
        // BroadcastChannel may be closed - don't break the producer.
      }
    }
    return post
  }

  function emit(events: CaptionChannelEvent[]) {
    if (events.length === 0)
      return
    const send = resolvePost()
    if (!send)
      return
    for (const event of events)
      send(event)
  }

  function stopRevealPoller(turnId: string) {
    const timer = revealTimers.get(turnId)
    if (timer === undefined)
      return
    clearInterval(timer)
    revealTimers.delete(turnId)
  }

  /**
   * Drains every ready reveal from the tracker queue immediately. If the
   * head pair's translation has not streamed yet, the poller keeps the turn
   * scheduled and retries. Later pairs wait behind it to keep order.
   */
  function drainReveals(turnId: string) {
    while (tracker.hasPendingReveal(turnId)) {
      const events = tracker.takeNextReveal(turnId)
      // Empty result means the head pair's translation is not ready yet;
      // it stays queued and the poller retries. Stop draining to keep order.
      if (events.length === 0)
        break
      emit(events)
    }
  }

  function ensureRevealPoller(turnId: string) {
    drainReveals(turnId)
    if (!tracker.hasPendingReveal(turnId) || revealTimers.has(turnId))
      return

    const timer = setInterval(() => {
      drainReveals(turnId)
      if (!tracker.hasPendingReveal(turnId))
        stopRevealPoller(turnId)
    }, REVEAL_TICK_MS)
    revealTimers.set(turnId, timer)
  }

  function noteSentenceStarted(turnId: string) {
    tracker.advancePlayback(turnId)
    ensureRevealPoller(turnId)
  }

  /** Stops reveal polling and publishes pairs playback never reached. */
  function flushTurn(turnId: string) {
    stopRevealPoller(turnId)
    emit(tracker.endTurn(turnId))
  }

  return {
    mapIntentToTurn(intentId, turnId) {
      intentTurns.set(intentId, turnId)
    },
    ingestSpoken: turnId => tracker.ingestSpoken(turnId),
    ingestTranslation(turnId, payload) {
      const label = labelsByCode.get(payload.language) ?? payload.language
      const events = tracker.ingestTranslation(turnId, payload, label)
      emit(events)
      // A late translation can complete the pair a poller is waiting on.
      if (events.length === 0 && tracker.hasPendingReveal(turnId))
        ensureRevealPoller(turnId)
    },
    routePlaybackItem(item) {
      const turnId = item.turnId ?? intentTurns.get(item.intentId)
      if (turnId)
        noteSentenceStarted(turnId)
    },
    advancePlayback: noteSentenceStarted,
    /**
     * Flushes by intent id. Called when the playback manager reports the
     * intent drained (every item ended/rejected) or by a no-audio fallback.
     * Idempotent: after a normal drain every pair is already revealed, so
     * this posts nothing.
     */
    flushIntent(intentId: string, turnId?: string) {
      const resolved = turnId ?? intentTurns.get(intentId)
      if (resolved)
        flushTurn(resolved)
    },
    flushTurn,
    resetTurn(turnId) {
      stopRevealPoller(turnId)
      intentTurns.forEach((mapped, intentId) => {
        if (mapped === turnId)
          intentTurns.delete(intentId)
      })
      emit(tracker.resetTurn(turnId))
    },
    resetAll() {
      revealTimers.forEach(timer => clearInterval(timer))
      revealTimers.clear()
      intentTurns.clear()
      emit(tracker.resetAll())
    },
  }
}

let sharedBus: BilingualCaptionBus | undefined

/**
 * Returns the process-wide bilingual caption bus.
 *
 * Chat turns (Stage.vue) and spark-notify reactions (character store) both
 * speak through the same speech pipeline and caption channel, so one bus
 * owns the pair tracker and posts translation caption events.
 */
export function useBilingualCaptionBus(): BilingualCaptionBus {
  sharedBus ??= createBus()
  return sharedBus
}
