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

// Positional binder between UST pairs and TTS playback. The model writes
// `<spoken sentence> [<translation>]`; prompt boundaries and the flush
// marker make TTS emit one playback item per pair, so the Nth reached
// playback boundary reveals the Nth translation. One translation event
// arrives per pair (full text, at bracket close), in pair order. Pair
// ingest and playback reveal live in this one process (the Stage
// renderer) and post to the caption window over a BroadcastChannel.

interface TurnState {
  /** Translation text by pair id, present once the bracket closes. */
  translations: Map<number, PairTranslation>
  /** Playback boundaries reached (sentences that started playing). */
  boundaries: number
  /** Number of consecutive pairs already revealed, FIFO order. */
  revealed: number
  /** Terminal flush already published; keeps flushTurn idempotent. */
  flushed: boolean
}

interface PairTranslation {
  label: string
  text: string
}

function eventFor(pair: PairTranslation): CaptionChannelEvent {
  return { operation: 'replace', text: pair.text, type: 'caption-assistant-translation', label: pair.label }
}

const RESET_EVENT: CaptionChannelEvent = { operation: 'replace', text: '', type: 'caption-assistant-translation' }

export interface BilingualCaptionBus {
  mapIntentToTurn: (intentId: string, turnId: string) => void
  ingestTranslation: (turnId: string, payload: TokenTranslationPayload) => void
  routePlaybackItem: (item: BilingualCaptionPlaybackItem) => void
  advancePlayback: (turnId: string) => void
  flushIntent: (intentId: string, turnId?: string) => void
  flushTurn: (turnId: string) => void
  resetTurn: (turnId: string) => void
  resetAll: () => void
}

function createBus(): BilingualCaptionBus {
  const turns = new Map<string, TurnState>()
  const intentTurns = new Map<string, string>()

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
    if (send)
      events.forEach(send)
  }

  // Reveal consecutive pairs whose playback boundary was reached and
  // whose translation has arrived. A missing head pair blocks later
  // pairs; it reveals itself when its translation arrives, so no polling
  // is needed.
  function revealReady(turn: TurnState): CaptionChannelEvent[] {
    const events: CaptionChannelEvent[] = []
    while (turn.revealed < turn.boundaries) {
      const pair = turn.translations.get(turn.revealed)
      if (!pair)
        break
      events.push(eventFor(pair))
      turn.revealed += 1
    }
    return events
  }

  return {
    mapIntentToTurn(intentId, turnId) {
      intentTurns.set(intentId, turnId)
    },
    ingestTranslation(turnId, payload) {
      if (!payload.text)
        return
      let turn = turns.get(turnId)
      if (!turn) {
        turn = { translations: new Map(), boundaries: 0, revealed: 0, flushed: false }
        turns.set(turnId, turn)
      }
      const label = BILINGUAL_LANGUAGES.find(language => language.code === payload.language)?.label ?? payload.language
      turn.translations.set(payload.pairId, { label, text: payload.text.trim() })
      emit(revealReady(turn))
    },
    advancePlayback(turnId) {
      let turn = turns.get(turnId)
      if (!turn) {
        // Boundary can precede every translation event of the turn.
        turn = { translations: new Map(), boundaries: 0, revealed: 0, flushed: false }
        turns.set(turnId, turn)
      }
      turn.boundaries += 1
      emit(revealReady(turn))
    },
    routePlaybackItem(item) {
      const turnId = item.turnId ?? intentTurns.get(item.intentId)
      if (turnId)
        this.advancePlayback(turnId)
    },
    // Idempotent: onTurnEnd and onIntentDrained both flush a turn.
    flushIntent(intentId, turnId?) {
      const resolved = turnId ?? intentTurns.get(intentId)
      if (resolved)
        this.flushTurn(resolved)
    },
    flushTurn(turnId) {
      const turn = turns.get(turnId)
      if (!turn || turn.flushed)
        return
      turn.flushed = true
      turns.delete(turnId)
      intentTurns.forEach((mapped, intentId) => {
        if (mapped === turnId)
          intentTurns.delete(intentId)
      })
      // Publish pairs playback never reached (muted turn, no audio,
      // trailing translation) as ONE multi-line replace, in pair order.
      const pending = [...turn.translations.entries()]
        .filter(([id]) => id >= turn.revealed)
        .sort(([a], [b]) => a - b)
        .map(([, pair]) => pair)
      if (pending.length === 0)
        return
      emit([{
        operation: 'replace',
        text: pending.map(pair => pair.text).join('\n'),
        type: 'caption-assistant-translation',
        label: pending[0]?.label,
      }])
    },
    resetTurn(turnId) {
      if (!turns.delete(turnId))
        return
      intentTurns.forEach((mapped, intentId) => {
        if (mapped === turnId)
          intentTurns.delete(intentId)
      })
      emit([RESET_EVENT])
    },
    resetAll() {
      if (turns.size === 0)
        return
      turns.clear()
      intentTurns.clear()
      emit([RESET_EVENT])
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
