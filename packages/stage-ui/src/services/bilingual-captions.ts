import type { TokenTranslationPayload } from '@proj-airi/core-agent'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { BILINGUAL_LANGUAGES } from '@proj-airi/pipelines-audio'

/** Minimal playback item shape the bus needs from either TTS transport. */
export interface BilingualCaptionPlaybackItem {
  /** Turn id stamped on REST pipeline items. */
  turnId?: string
  /** Intent id used to resolve streaming items that lack a turn id. */
  intentId: string
}

// Positional binder between translated UST pairs and TTS playback. The
// model writes `<spoken sentence> [<translation>]`; prompt boundaries and
// the flush marker make TTS emit one playback item per pair, so the Nth
// played item reveals pair N. Pair ingest, playback reveal and the
// BroadcastChannel to the caption window live in this one process (the
// Stage renderer): other renderers never split or ingest pairs.

interface PairTranslation {
  /** Native language name used as the caption badge, for example `中文`. */
  label: string
  text: string
}

interface CaptionPair {
  id: number
  translation: PairTranslation | undefined
  /** Playback reached this pair. */
  played: boolean
  /** A reveal for this pair was already dequeued and shown. */
  revealed: boolean
}

interface CaptionTurn {
  pairs: CaptionPair[]
  byId: Map<number, CaptionPair>
  /** Next wire block expected, mirroring the splitter state machine. */
  phase: 'spoken' | 'translation'
  /** Pair ids that own speech, in playback order. */
  playablePairs: number[]
  /** Playback position inside `playablePairs`. */
  playbackIndex: number
  /** Pair ids waiting to be revealed, in playback order. */
  revealQueue: number[]
  /** Pair id currently on screen, if any. */
  currentPairId: number | undefined
  /** Last posted translation text, used to skip duplicate events. */
  lastPublishedText: string | undefined
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function createCaptionTracker() {
  const turns = new Map<string, CaptionTurn>()

  function ensureTurn(turnId: string): CaptionTurn {
    let turn = turns.get(turnId)
    if (!turn) {
      turn = {
        pairs: [],
        byId: new Map(),
        phase: 'spoken',
        playablePairs: [],
        playbackIndex: 0,
        revealQueue: [],
        currentPairId: undefined,
        lastPublishedText: undefined,
      }
      turns.set(turnId, turn)
    }
    return turn
  }

  function createPair(turn: CaptionTurn, id: number): CaptionPair {
    const pair: CaptionPair = { id, translation: undefined, played: false, revealed: false }
    turn.pairs.push(pair)
    turn.pairs.sort((a, b) => a.id - b.id)
    turn.byId.set(id, pair)
    return pair
  }

  function pairForSpoken(turn: CaptionTurn): CaptionPair {
    const last = turn.pairs.at(-1)
    if (last && turn.phase === 'spoken')
      return last

    const nextId = last ? last.id + 1 : 0
    const pair = createPair(turn, nextId)
    turn.phase = 'spoken'
    turn.playablePairs.push(nextId)
    return pair
  }

  function eventForPair(turn: CaptionTurn, pair: CaptionPair): CaptionChannelEvent | undefined {
    if (!pair.translation)
      return undefined
    const text = normalize(pair.translation.text)
    if (!text || text === turn.lastPublishedText)
      return undefined
    turn.lastPublishedText = text
    return {
      operation: 'replace',
      text,
      type: 'caption-assistant-translation',
      label: pair.translation.label,
    }
  }

  function ingestSpoken(turnId: string) {
    pairForSpoken(ensureTurn(turnId))
  }

  function ingestTranslation(turnId: string, payload: TokenTranslationPayload, label: string): CaptionChannelEvent[] {
    if (!payload.text)
      return []
    const turn = ensureTurn(turnId)
    let pair = turn.byId.get(payload.pairId)
    if (!pair)
      pair = createPair(turn, payload.pairId)
    turn.phase = 'translation'
    if (pair.translation)
      pair.translation.text += payload.text
    else
      pair.translation = { label, text: payload.text }

    // Stream corrections only for the pair currently on screen.
    if (pair.revealed && pair.id === turn.currentPairId) {
      const event = eventForPair(turn, pair)
      return event ? [event] : []
    }
    return []
  }

  function advancePlayback(turnId: string) {
    const turn = turns.get(turnId)
    if (!turn || turn.playbackIndex >= turn.playablePairs.length)
      return
    const pairId = turn.playablePairs[turn.playbackIndex]!
    turn.playbackIndex += 1
    const pair = turn.byId.get(pairId)
    if (pair) {
      pair.played = true
      if (!turn.revealQueue.includes(pair.id))
        turn.revealQueue.push(pair.id)
    }
  }

  function takeNextReveal(turnId: string): CaptionChannelEvent[] {
    const turn = turns.get(turnId)
    if (!turn)
      return []
    const pairId = turn.revealQueue[0]
    if (pairId === undefined)
      return []
    const pair = turn.byId.get(pairId)
    if (!pair) {
      turn.revealQueue.shift()
      return []
    }
    // Translation not generated yet: leave it at the queue head; the bus
    // poller retries and later pairs wait to preserve order.
    if (!pair.translation || !normalize(pair.translation.text))
      return []

    turn.revealQueue.shift()
    pair.revealed = true
    turn.currentPairId = pair.id
    const event = eventForPair(turn, pair)
    return event ? [event] : []
  }

  function hasPendingReveal(turnId: string): boolean {
    return Boolean(turns.get(turnId)?.revealQueue.length)
  }

  function endTurn(turnId: string): CaptionChannelEvent[] {
    const turn = turns.get(turnId)
    if (!turn)
      return []

    // Pairs queued but never revealed, then pairs playback never reached.
    const pending: CaptionPair[] = []
    for (const id of turn.revealQueue) {
      const pair = turn.byId.get(id)
      if (pair && !pair.revealed)
        pending.push(pair)
    }
    for (const pair of turn.pairs) {
      if (!pair.played && pair.translation && normalize(pair.translation.text))
        pending.push(pair)
    }
    turn.revealQueue = []

    const lines = pending
      .map(pair => pair.translation ? normalize(pair.translation.text) : '')
      .filter(Boolean)
    if (lines.length === 0)
      return []

    for (const pair of pending)
      pair.revealed = pair.played = true
    turn.currentPairId = pending.at(-1)?.id
    turn.lastPublishedText = lines.join('\n')
    return [{
      operation: 'replace',
      text: lines.join('\n'),
      type: 'caption-assistant-translation',
      label: pending[0]?.translation?.label,
    }]
  }

  function resetTurn(turnId: string): CaptionChannelEvent[] {
    if (!turns.delete(turnId))
      return []
    return [{ operation: 'replace', text: '', type: 'caption-assistant-translation' }]
  }

  function resetAll(): CaptionChannelEvent[] {
    if (turns.size === 0)
      return []
    turns.clear()
    return [{ operation: 'replace', text: '', type: 'caption-assistant-translation' }]
  }

  return { ingestSpoken, ingestTranslation, advancePlayback, takeNextReveal, hasPendingReveal, endTurn, resetTurn, resetAll }
}

// BroadcastChannel reveal poller tick. Runs only for the rare case where
// a sentence starts before its translation finished streaming.
const REVEAL_TICK_MS = 60

const labelsByCode = new Map<string, string>(BILINGUAL_LANGUAGES.map(language => [language.code, language.label]))

export interface BilingualCaptionBus {
  mapIntentToTurn: (intentId: string, turnId: string) => void
  ingestSpoken: (turnId: string) => void
  ingestTranslation: (turnId: string, payload: TokenTranslationPayload) => void
  routePlaybackItem: (item: BilingualCaptionPlaybackItem) => void
  advancePlayback: (turnId: string) => void
  flushIntent: (intentId: string, turnId?: string) => void
  flushTurn: (turnId: string) => void
  resetTurn: (turnId: string) => void
  resetAll: () => void
}

function createBus(): BilingualCaptionBus {
  const tracker = createCaptionTracker()
  const intentTurns = new Map<string, string>()
  const revealTimers = new Map<string, ReturnType<typeof setInterval>>()

  let post: ((event: CaptionChannelEvent) => void) | undefined

  // Native channel instead of VueUse's useBroadcastChannel: VueUse creates
  // its channel inside tryOnMounted, which never runs for an emit from an
  // async hook without a component scope; its post would then silently
  // no-op and drop every translation event.
  function resolvePost() {
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

  function drainReveals(turnId: string) {
    while (tracker.hasPendingReveal(turnId)) {
      const events = tracker.takeNextReveal(turnId)
      if (events.length === 0)
        break
      emit(events)
    }
  }

  function ensureRevealPoller(turnId: string) {
    drainReveals(turnId)
    if (!tracker.hasPendingReveal(turnId) || revealTimers.has(turnId))
      return
    revealTimers.set(turnId, setInterval(() => {
      drainReveals(turnId)
      if (!tracker.hasPendingReveal(turnId))
        stopRevealPoller(turnId)
    }, REVEAL_TICK_MS))
  }

  function noteSentenceStarted(turnId: string) {
    tracker.advancePlayback(turnId)
    ensureRevealPoller(turnId)
  }

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
      if (events.length === 0 && tracker.hasPendingReveal(turnId))
        ensureRevealPoller(turnId)
    },
    routePlaybackItem(item) {
      const turnId = item.turnId ?? intentTurns.get(item.intentId)
      if (turnId)
        noteSentenceStarted(turnId)
    },
    advancePlayback: noteSentenceStarted,
    // Idempotent: after a normal drain every pair is already revealed.
    flushIntent(intentId, turnId?) {
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
 * Process-wide bilingual caption bus. Chat turns and spark reactions share
 * one speech pipeline and caption channel in the Stage renderer.
 */
export function useBilingualCaptionBus(): BilingualCaptionBus {
  sharedBus ??= createBus()
  return sharedBus
}
