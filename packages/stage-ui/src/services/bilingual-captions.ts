import type { TokenTranslationPayload } from '@proj-airi/core-agent'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { BILINGUAL_LANGUAGES } from '@proj-airi/pipelines-audio'

// Offset binder between UST pairs and TTS playback. Each translation
// records where its spoken sentence began in the spoken text. Playback
// reports each started clip's text, so the pair whose offset is reached
// reveals itself. Clips per pair can vary without breaking alignment.

interface TurnState {
  /** Translation text by pair id, present once the bracket closes. */
  translations: Map<number, PairTranslation>
  /** Spoken offsets by pair id, ascending. Reveal when playback reaches one. */
  starts: Map<number, number>
  /** Cumulative non-whitespace clip characters that started playing. */
  played: number
  /** Pair ids already revealed, in insertion order. */
  revealed: Set<number>
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
  notePlayedText: (turnId: string, clipText: string) => void
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

  // Reveal every pair whose offset the playback reached. A missing
  // translation reveals itself when it arrives, so one gap never blocks
  // the rest. `played` excludes the pair at that offset: its text has
  // not started playing yet.
  function revealReady(turn: TurnState): CaptionChannelEvent[] {
    const events: CaptionChannelEvent[] = []
    const due = [...turn.translations.keys()]
      .filter(id => !turn.revealed.has(id) && (turn.starts.get(id) ?? Infinity) < turn.played)
      .sort((a, b) => (turn.starts.get(a) ?? 0) - (turn.starts.get(b) ?? 0))
    for (const id of due) {
      const pair = turn.translations.get(id)
      if (!pair)
        continue
      events.push(eventFor(pair))
      turn.revealed.add(id)
    }
    return events
  }

  function ensureTurn(turnId: string): TurnState {
    let turn = turns.get(turnId)
    if (!turn) {
      turn = { translations: new Map(), starts: new Map(), played: 0, revealed: new Set() }
      turns.set(turnId, turn)
    }
    return turn
  }

  return {
    ingestTranslation(turnId, payload) {
      if (!payload.text)
        return
      const turn = ensureTurn(turnId)
      const label = BILINGUAL_LANGUAGES.find(language => language.code === payload.language)?.label ?? payload.language
      turn.translations.set(payload.pairId, { label, text: payload.text.trim() })
      turn.starts.set(payload.pairId, payload.spokenStart)
      emit(revealReady(turn))
    },
    notePlayedText(turnId, clipText) {
      // Clip text equals the spoken substring the splitter counted: the
      // chunker never rewrites characters in flush mode. Whitespace is
      // stripped on both sides, so the offsets cannot drift.
      const spoken = clipText.replace(/\s/g, '').length
      if (spoken === 0)
        return
      const turn = ensureTurn(turnId)
      turn.played += spoken
      emit(revealReady(turn))
    },
    flushTurn(turnId) {
      // Deleting the turn keeps this terminal and idempotent.
      const turn = turns.get(turnId)
      if (!turn)
        return
      turns.delete(turnId)
      // Publish pairs playback never reached (muted turn, no audio,
      // trailing translation) as ONE multi-line replace, in pair order.
      const pending = [...turn.translations.entries()]
        .filter(([id]) => !turn.revealed.has(id))
        .sort(([a], [b]) => (turn.starts.get(a) ?? 0) - (turn.starts.get(b) ?? 0))
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
