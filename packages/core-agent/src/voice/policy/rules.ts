import type { AudioRange, Position } from '@proj-airi/pipelines-audio'

import type { BeginSpeechInput } from '../input/types'
import type { TurnRef } from '../turn'
import type { Emission, RuleStep, VoiceCommand, VoiceRule } from './types'

import { emission, isEvent } from './engine'
import {
  endJudgedSignal,
  inputActivitySignal,
  inputBegunEvent,
  inputCapturingEvent,
  inputFinalizingEvent,
  inputSettledEvent,
  inputTranscriptEvent,
  pausedSignal,
  speechActivitySignal,
} from './events'

/** The input that a rule follows. `from` is its first frame, known at a speech onset or when capture starts. */
interface TrackedInput {
  readonly inputId: string
  readonly sessionId: string
  readonly from?: Position
}

export interface SpeechActivityRuleOptions {
  /** @default 0.6. A live input uses 30 percent of this score to keep speech active. */
  readonly threshold?: number
  /** @default 300. Shorter speech is discarded when silence ends an input. */
  readonly minSpeechMs?: number
  /** This much silence ends an input that this rule began. A function is read on each window. @default 1200 */
  readonly silenceMs?: number | (() => number)
  /** @default 360. Speech onset keeps this much audio before the detected window. */
  readonly preRollMs?: number
  /** The session and turns for speech without a wake word. Undefined starts no input, for example in wake word mode. */
  readonly target: () => { sessionId: string, interruptTurns: readonly TurnRef[] } | undefined
  /** A false value cancels the input that this rule began and starts no new input. */
  readonly enabled?: () => boolean
}

/** One VAD window after the threshold decided whether it is speech. */
interface ActivityWindow {
  readonly range: AudioRange
  readonly durationMs: number
  readonly speech: boolean
}

/** The input that this rule began, and its counters. */
interface OwnedInput {
  readonly inputId: string
  readonly sessionId: string
  readonly speechMs: number
  readonly silenceMs: number
  /** The end frame of the last counted window. Undefined until the first frame of the input is known. */
  readonly activityEnd?: number
  /**
   * Windows that arrived before the first frame was known. After a wake, capture starts after playback silence, and
   * VAD windows can arrive before the `capturing` event. They are counted when it arrives.
   */
  readonly waiting: readonly ActivityWindow[]
}

interface SpeechActivityState {
  /** The active input of the controller. A manual input is active too, and this rule then does nothing. */
  readonly active?: TrackedInput
  readonly owned?: OwnedInput
  /** A begin command that waits for its `begun` event. The window that began it counts for the new input. */
  readonly beginning?: { readonly cause: 'speech' | 'wake-word', readonly firstWindow: ActivityWindow }
}

/** The result of counting windows for the owned input. `owned` is undefined after a seal or cancel. */
interface CountResult {
  readonly owned?: OwnedInput
  readonly emit: readonly Emission[]
  readonly commands: readonly VoiceCommand[]
}

/**
 * Turns VAD windows into input commands.
 *
 * - Speech above `threshold`, or a wake word for another session, begins an input when the echo gate accepted it.
 * - For its own input, a window counts only when it is inside the input and continues the last counted window.
 *   Each counted window becomes an `input-activity` signal. The pause and speaker rules read that signal.
 * - Silence of `silenceMs` seals the input, or cancels it when it has less than `minSpeechMs` of speech.
 * - A manual input owns its interval. The rule ignores windows while another input is active.
 */
export function createSpeechActivityRule(options: SpeechActivityRuleOptions): VoiceRule<SpeechActivityState> {
  const threshold = options.threshold ?? 0.6
  const preRollMs = options.preRollMs ?? 360

  return {
    name: 'speech-activity',
    initial: () => ({}),
    reduce(state, event): RuleStep<SpeechActivityState> {
      if (isEvent(event, inputBegunEvent)) {
        const { inputId, sessionId, start, cause } = event.body
        const from = start.kind === 'speech-onset' ? start.at : undefined
        const active: TrackedInput = { inputId, sessionId, from }
        const beginning = state.beginning
        if (!beginning || cause !== beginning.cause)
          return { state: { active } }

        // The rule began this input. A speech onset includes its first window, so that window counts now.
        const owned: OwnedInput = { inputId, sessionId, speechMs: 0, silenceMs: 0, activityEnd: from?.frame, waiting: [] }
        if (!from)
          return { state: { active, owned } }
        const counted = count(owned, from, [beginning.firstWindow])
        return { state: { active, owned: counted.owned }, emit: counted.emit, commands: counted.commands }
      }
      if (isEvent(event, inputCapturingEvent)) {
        if (state.active?.inputId !== event.body.inputId)
          return { state }
        const active = { ...state.active, from: event.body.from }
        if (!state.owned || state.owned.activityEnd !== undefined)
          return { state: { ...state, active } }
        // The first frame is known now. Count the windows that arrived before it.
        const counted = count({ ...state.owned, activityEnd: event.body.from.frame, waiting: [] }, event.body.from, state.owned.waiting)
        return { state: { ...state, active, owned: counted.owned }, emit: counted.emit, commands: counted.commands }
      }
      // A finalizing input no longer accepts audio, and the controller can begin the next input.
      if (isEvent(event, inputFinalizingEvent) || isEvent(event, inputSettledEvent)) {
        if (state.active?.inputId !== event.body.inputId && state.owned?.inputId !== event.body.inputId)
          return { state }
        return { state: { ...state, active: state.active?.inputId === event.body.inputId ? undefined : state.active, owned: state.owned?.inputId === event.body.inputId ? undefined : state.owned } }
      }
      if (!isEvent(event, speechActivitySignal))
        return { state }

      const { range, durationMs, score, discontinuity, accepted, wake } = event.body
      // A gap ends the rule's claim on its input. The capture fails on the same gap.
      const owned = discontinuity ? undefined : state.owned
      const active = state.active
      if (active && active.inputId !== owned?.inputId)
        return { state: { ...state, owned } }

      if (options.enabled && !options.enabled()) {
        const commands: VoiceCommand[] = owned ? [{ type: 'cancel', inputId: owned.inputId, reason: 'Automatic speech input is paused' }] : []
        return { state: { ...state, owned: undefined }, commands }
      }

      const speech = score >= (owned ? threshold * 0.3 : threshold)
      if ((wake && wake.sessionId !== owned?.sessionId) || (!owned && speech)) {
        if (!accepted)
          return { state: { ...state, owned } }
        const target = wake ?? options.target()
        if (!target)
          return { state: { ...state, owned } }

        const cause = wake ? 'wake-word' as const : 'speech' as const
        const input: BeginSpeechInput = {
          sessionId: target.sessionId,
          interruptTurns: target.interruptTurns,
          cause,
          start: wake
            ? { kind: 'after-silence' }
            : { kind: 'speech-onset', at: { sourceId: range.sourceId, frame: range.startFrame }, preRollMs },
        }
        return { state: { ...state, owned: undefined, beginning: { cause, firstWindow: { speech, durationMs, range } } }, commands: [{ type: 'begin', input }] }
      }

      if (!owned || !active)
        return { state: { ...state, owned } }

      const window = { range, durationMs, speech }
      if (!active.from)
        return { state: { ...state, owned: { ...owned, waiting: [...owned.waiting, window] } } }
      const counted = count(owned, active.from, [window])
      return { state: { ...state, owned: counted.owned }, emit: counted.emit, commands: counted.commands }
    },
  }

  /** Counts windows in order. Silence of the limit seals or cancels the input, and later windows are dropped. */
  function count(start: OwnedInput, from: Position, windows: readonly ActivityWindow[]): CountResult {
    const emit: Emission[] = []
    let owned = start
    for (const { range, durationMs, speech } of windows) {
      const activityEnd = owned.activityEnd ?? from.frame
      // A window counts when it is inside the input and continues the last counted window without a gap.
      const inside = range.sourceId === from.sourceId && range.startFrame >= from.frame
      if (!inside || range.endFrame <= activityEnd || range.startFrame > activityEnd)
        continue

      emit.push(emission(inputActivitySignal, { inputId: owned.inputId, range, speech, durationMs }))
      owned = { ...owned, speechMs: owned.speechMs + (speech ? durationMs : 0), silenceMs: speech ? 0 : owned.silenceMs + durationMs, activityEnd: range.endFrame }
      const limit = typeof options.silenceMs === 'function' ? options.silenceMs() : options.silenceMs ?? 1200
      if (owned.silenceMs < limit)
        continue

      const command: VoiceCommand = owned.speechMs < (options.minSpeechMs ?? 300)
        ? { type: 'cancel', inputId: owned.inputId, reason: 'Speech segment was too short' }
        : { type: 'seal', inputId: owned.inputId, at: { sourceId: range.sourceId, frame: range.endFrame } }
      return { owned: undefined, emit, commands: [command] }
    }
    return { owned, emit, commands: [] }
  }
}

export interface PauseRuleOptions {
  /** Silence after the last speech that counts as a pause. Shorter pauses are breaths between words. @default 1200 */
  readonly pauseMs?: number
}

interface PauseState {
  readonly inputs: ReadonlyMap<string, { readonly sessionId: string, readonly text: string, readonly spoke: boolean, readonly pausedMs: number, readonly reported?: string }>
}

/**
 * Emits `paused` when the speaker of an input stops after speech.
 *
 * Silence before the first speech is the wait after a wake word, not a pause. Each pause reports one state of the
 * transcript once. New text during the same pause reports again, because a judgement of the old text is stale.
 */
export function createPauseRule(options: PauseRuleOptions = {}): VoiceRule<PauseState> {
  const pauseMs = options.pauseMs ?? 1200

  return {
    name: 'pause',
    initial: () => ({ inputs: new Map() }),
    reduce(state, event, context): RuleStep<PauseState> {
      const inputs = new Map(state.inputs)
      if (isEvent(event, inputBegunEvent)) {
        inputs.set(event.body.inputId, { sessionId: event.body.sessionId, text: '', spoke: false, pausedMs: 0 })
        return { state: { inputs } }
      }
      if (isEvent(event, inputSettledEvent) || isEvent(event, inputFinalizingEvent)) {
        inputs.delete(event.body.inputId)
        return { state: { inputs } }
      }
      if (isEvent(event, inputTranscriptEvent)) {
        const input = inputs.get(event.body.inputId)
        if (input)
          inputs.set(event.body.inputId, { ...input, text: event.body.text })
        return { state: { inputs } }
      }
      if (!isEvent(event, inputActivitySignal))
        return { state }

      const { inputId, speech, durationMs } = event.body
      const input = inputs.get(inputId)
      if (!input)
        return { state }
      if (speech) {
        inputs.set(inputId, { ...input, spoke: true, pausedMs: 0 })
        return { state: { inputs } }
      }

      const pausedMs = input.pausedMs + durationMs
      const text = input.text.trim()
      const revisions = context.revisions(inputId)
      // One report for each state of speech and text. A new speech segment changes the activity revision.
      const key = JSON.stringify([text, revisions[inputActivitySignal.id] ?? 0])
      if (!input.spoke || pausedMs < pauseMs || !text || key === input.reported) {
        inputs.set(inputId, { ...input, pausedMs })
        return { state: { inputs } }
      }

      inputs.set(inputId, { ...input, pausedMs, reported: key })
      return { state: { inputs }, emit: [emission(pausedSignal, { inputId, sessionId: input.sessionId, text, readAt: revisions })] }
    },
  }
}

/** Seals an input when a model judged it complete and nothing that the judgement read has changed since. */
export function createEndJudgementRule(): VoiceRule<{ readonly capturing: ReadonlySet<string> }> {
  return {
    name: 'end-judgement',
    initial: () => ({ capturing: new Set() }),
    reduce(state, event, context) {
      if (isEvent(event, inputCapturingEvent))
        return { state: { capturing: new Set(state.capturing).add(event.body.inputId) } }
      if (isEvent(event, inputFinalizingEvent) || isEvent(event, inputSettledEvent)) {
        const capturing = new Set(state.capturing)
        capturing.delete(event.body.inputId)
        return { state: { capturing } }
      }
      if (!isEvent(event, endJudgedSignal))
        return { state }

      const { inputId, result, readAt } = event.body
      if (result !== 'complete' || !state.capturing.has(inputId) || !context.isCurrent(inputId, readAt))
        return { state }
      return { state, commands: [{ type: 'seal', inputId }] }
    },
  }
}
