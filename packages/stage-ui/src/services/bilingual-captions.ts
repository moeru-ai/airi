import type { TokenTranslationPayload } from '@proj-airi/core-agent'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { BILINGUAL_LANGUAGES } from '@proj-airi/pipelines-audio'

// Positional binder between UST pairs and TTS playback. The model writes
// `<spoken sentence> [<translation>]`; the flush channel makes TTS emit one
// clip per pair, so the Nth started clip reveals that translation. Ingest
// and reveal both run in the Stage renderer and post over BroadcastChannel.

interface TurnState {
  /** Translation text by pair id, present once the bracket closes. */
  translations: Map<number, PairTranslation>
  /** Number of playback clips that started. */
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
  ingestTranslation: (turnId: string, payload: TokenTranslationPayload) => void
  advancePlayback: (turnId: string) => void
  flushTurn: (turnId: string) => void
  resetTurn: (turnId: string) => void
  resetAll: () => void
}

function createBus(): BilingualCaptionBus {
  const turns = new Map<string, TurnState>()

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

  // Reveal consecutive pairs whose playback clip started and whose
  // translation has arrived. A missing head pair blocks later pairs; it
  // reveals itself when its translation arrives, so no polling is needed.
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
        // Clip start can precede every translation event of the turn.
        turn = { translations: new Map(), boundaries: 0, revealed: 0, flushed: false }
        turns.set(turnId, turn)
      }
      turn.boundaries += 1
      emit(revealReady(turn))
    },
    flushTurn(turnId) {
      const turn = turns.get(turnId)
      if (!turn || turn.flushed)
        return
      turn.flushed = true
      turns.delete(turnId)
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
      emit([RESET_EVENT])
    },
    resetAll() {
      if (turns.size === 0)
        return
      turns.clear()
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

// Per-turn speech flags shared between the speech producers (chat hooks,
// spark reactions) and the Stage output factory. All of them run in the
// Stage renderer process, so module-local sets are sufficient.

/** Turns whose REST chunker must cut only on explicit flush markers. */
const flushBoundaryTurns = new Set<string>()

/** Turns whose active speech session buffers the whole audio. */
const bufferedTurns = new Set<string>()

/** Opts one turn into flush-only sentence boundaries for its REST session. */
export function enableFlushBoundaryTurn(turnId: string): void {
  flushBoundaryTurns.add(turnId)
}

/** Whether the turn opted into flush-only sentence boundaries. */
export function isFlushBoundaryTurn(turnId: string): boolean {
  return flushBoundaryTurns.has(turnId)
}

/**
 * Marks one turn's session as whole-session buffered. Sentence frames
 * arrive during synthesis there, so translation captions cannot align to
 * playback and the turn skips them.
 */
export function markBufferedSpeechTurn(turnId: string): void {
  bufferedTurns.add(turnId)
}

/** Whether the turn's speech session buffers the whole audio. */
export function isBufferedSpeechTurn(turnId: string): boolean {
  return bufferedTurns.has(turnId)
}

/** Clears one turn's flush and buffered flags. Call after the turn ends. */
export function clearSpeechTurnFlags(turnId: string): void {
  flushBoundaryTurns.delete(turnId)
  bufferedTurns.delete(turnId)
}

/** Clears every turn flag. Call when the speech surface resets. */
export function resetSpeechTurnFlags(): void {
  flushBoundaryTurns.clear()
  bufferedTurns.clear()
}
