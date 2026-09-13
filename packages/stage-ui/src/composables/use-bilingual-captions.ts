import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

/**
 * Positional binder between translated sentence pairs and TTS playback.
 *
 * Wire format (UST):
 *
 * ```text
 * Hello! [你好！] How are you? [你好吗？]
 * ```
 *
 * The model writes one spoken sentence and its translation as one pair.
 * The prompt and the TTS flush marker make the TTS layer emit one playback
 * item per spoken sentence, in order. Alignment is positional: the Nth
 * played item reveals pair N. No text is compared.
 *
 * Reveals go through a FIFO queue so translations are never lost and stay
 * rate-independent:
 *
 * - A reveal is enqueued when a spoken sentence STARTS playing (the
 *   sentence item `onStart` for REST and non-buffered WebSocket TTS, or an
 *   upstream sentence boundary for buffered WebSocket TTS). The translation
 *   and the spoken line then change together. No timer is involved.
 * - The translation for a pair always streams before its TTS item can
 *   start: the flush token that cuts the item precedes the translation
 *   event, and synthesis plus playback takes much longer than that gap. If
 *   the translation is late anyway, the reveal waits at the queue head and
 *   appears as soon as the text arrives. Later pairs wait behind it.
 * - A translation arriving after its reveal streams live only while that
 *   pair is current. It never resurrects an earlier pair.
 * - Pairs never reached by playback publish at turn end.
 */

export interface BilingualCaptionIngest {
  /** ISO 639-1 code from the translation hook payload. */
  language: string
  /** Sentence-pair identifier from the splitter. */
  pairId: number
  /** Fragment text from the translation hook. */
  text: string
}

export type BilingualCaptionOutEvent = CaptionChannelEvent

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

export interface BilingualCaptionTracker {
  /** Opens the pair that the next spoken fragments belong to. */
  ingestSpoken: (turnId: string) => void
  /** Stores a translated fragment. Streams it when the pair is current. */
  ingestTranslation: (turnId: string, payload: BilingualCaptionIngest, label: string) => BilingualCaptionOutEvent[]
  /**
   * Reports one spoken sentence started playing and enqueues its reveal.
   * Buffered WebSocket TTS calls this from its upstream sentence boundary.
   */
  advancePlayback: (turnId: string) => BilingualCaptionOutEvent[]
  /**
   * Dequeues the next reveal. Returns the event to show now, or nothing
   * when the queue is empty or the pair's translation is not ready yet.
   */
  takeNextReveal: (turnId: string) => BilingualCaptionOutEvent[]
  /** Whether a reveal is still queued (the bus keeps polling while true). */
  hasPendingReveal: (turnId: string) => boolean
  /** Publishes pairs whose playback never started when the turn ends. */
  endTurn: (turnId: string) => BilingualCaptionOutEvent[]
  /** Clears one turn and returns the event that clears its caption line. */
  resetTurn: (turnId: string) => BilingualCaptionOutEvent[]
  /** Clears every turn and returns the event that clears the caption line. */
  resetAll: () => BilingualCaptionOutEvent[]
}

export function createBilingualCaptionTracker(): BilingualCaptionTracker {
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
    if (!turn.playablePairs.includes(nextId))
      turn.playablePairs.push(nextId)
    return pair
  }

  function pairForTranslation(turn: CaptionTurn, pairId: number): CaptionPair {
    return turn.byId.get(pairId) ?? createPair(turn, pairId)
  }

  function eventForPair(turn: CaptionTurn, pair: CaptionPair): BilingualCaptionOutEvent | undefined {
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
    const turn = ensureTurn(turnId)
    pairForSpoken(turn)
  }

  function ingestTranslation(turnId: string, payload: BilingualCaptionIngest, label: string): BilingualCaptionOutEvent[] {
    if (!payload.text)
      return []
    const turn = ensureTurn(turnId)
    const pair = pairForTranslation(turn, payload.pairId)
    turn.phase = 'translation'
    if (pair.translation)
      pair.translation.text += payload.text
    else
      pair.translation = { label, text: payload.text }

    // Stream corrections only for the pair currently on screen. A late
    // translation for an older pair must not replace the active line.
    if (pair.revealed && pair.id === turn.currentPairId) {
      const event = eventForPair(turn, pair)
      return event ? [event] : []
    }
    return []
  }

  function advanceOne(turnId: string): BilingualCaptionOutEvent[] {
    const turn = turns.get(turnId)
    if (!turn)
      return []
    if (turn.playbackIndex >= turn.playablePairs.length)
      return []

    const pairId = turn.playablePairs[turn.playbackIndex]
    turn.playbackIndex += 1
    const pair = pairId === undefined ? undefined : turn.byId.get(pairId)
    if (!pair)
      return []
    pair.played = true
    // Every played pair joins the reveal queue, so back-to-back sentence
    // starts do not drop a reveal.
    if (!turn.revealQueue.includes(pair.id))
      turn.revealQueue.push(pair.id)
    return []
  }

  function takeNextReveal(turnId: string): BilingualCaptionOutEvent[] {
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
    // Translation not generated yet. Leave it at the queue head; the bus
    // retries, and later queued pairs wait behind it to stay in order.
    if (!pair.translation || !normalize(pair.translation.text))
      return []

    turn.revealQueue.shift()
    pair.revealed = true
    turn.currentPairId = pair.id
    const event = eventForPair(turn, pair)
    return event ? [event] : []
  }

  function hasPendingReveal(turnId: string): boolean {
    const turn = turns.get(turnId)
    return Boolean(turn && turn.revealQueue.length > 0)
  }

  function endTurn(turnId: string): BilingualCaptionOutEvent[] {
    const turn = turns.get(turnId)
    if (!turn)
      return []

    // Flush pairs still queued but never revealed, then pairs playback never
    // reached (rejected TTS, muted speech). Keep playback order.
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

  function resetTurn(turnId: string): BilingualCaptionOutEvent[] {
    if (!turns.delete(turnId))
      return []
    return [{ operation: 'replace', text: '', type: 'caption-assistant-translation' }]
  }

  function resetAll(): BilingualCaptionOutEvent[] {
    if (turns.size === 0)
      return []
    turns.clear()
    return [{ operation: 'replace', text: '', type: 'caption-assistant-translation' }]
  }

  return {
    ingestSpoken,
    ingestTranslation,
    advancePlayback: advanceOne,
    takeNextReveal,
    hasPendingReveal,
    endTurn,
    resetTurn,
    resetAll,
  }
}
