import type { Eventa } from '@moeru/eventa'

import type { VoiceCommand, VoiceRule } from './types'

import { createContext, defineEventa } from '@moeru/eventa'
import { describe, expect, it } from 'vitest'

import { emission, isEvent, VoicePolicy } from './engine'
import { endJudgedSignal, inputActivitySignal, inputBegunEvent, inputCapturingEvent, inputSettledEvent, inputTranscriptEvent, pausedSignal, speechActivitySignal } from './events'
import { createEndJudgementRule, createPauseRule, createSpeechActivityRule } from './rules'

/** Lets the engine queue drain. The queue awaits each handler. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * An engine with a fake runtime. A `begin` command becomes a `begun` event, like the controller does.
 *
 * @example
 * const harness = createHarness([createPauseRule()])
 * harness.emit(inputBegunEvent, { inputId: 'one', sessionId: 'alice', start: { kind: 'after-silence' } })
 */
function createHarness(rules: VoiceRule<unknown>[], options: { contextRevision?: () => number } = {}) {
  const events = createContext()
  const commands: VoiceCommand[] = []
  const seen: Eventa<unknown>[] = []
  let next = 0
  const policy = new VoicePolicy(events, {
    contextRevision: options.contextRevision,
    execute: (command) => {
      commands.push(command)
      if (command.type === 'begin') {
        next += 1
        void events.emit(inputBegunEvent, { inputId: `input-${next}`, sessionId: command.input.sessionId, start: command.input.start, cause: command.input.cause })
      }
    },
  })
  for (const rule of rules)
    policy.addRule(rule)
  events.on(inputActivitySignal, event => void seen.push(event))
  events.on(pausedSignal, event => void seen.push(event))

  return {
    events,
    policy,
    commands,
    seen,
    emit<P>(eventa: Eventa<P>, body: P) {
      void events.emit(eventa, body)
    },
    /** One VAD window of `ms` milliseconds. */
    window(startFrame: number, ms: number, score: number, extra: { accepted?: boolean } = {}) {
      void events.emit(speechActivitySignal, { range: { sourceId: 'mic', startFrame, endFrame: startFrame + ms }, durationMs: ms, score, discontinuity: false, ...extra })
    },
  }
}

describe('voicePolicy', () => {
  it('delivers events that a rule emits after the current event reaches every rule', async () => {
    const ping = defineEventa<{ inputId: string }>('proj-airi:voice:test:ping')
    const pong = defineEventa<{ inputId: string }>('proj-airi:voice:test:pong')
    const order: string[] = []
    const first: VoiceRule<null> = {
      name: 'first',
      initial: () => null,
      reduce: (state, event) => {
        order.push(`first:${event.id.split(':').at(-1)}`)
        return isEvent(event, ping) ? { state, emit: [emission(pong, event.body)] } : { state }
      },
    }
    const second: VoiceRule<null> = { name: 'second', initial: () => null, reduce: (state, event) => {
      order.push(`second:${event.id.split(':').at(-1)}`)
      return { state }
    } }
    const harness = createHarness([first, second] as VoiceRule<unknown>[])

    harness.emit(ping, { inputId: 'one' })
    await flush()

    expect(order).toEqual(['first:ping', 'second:ping', 'first:pong', 'second:pong'])
  })

  it('runs only the first seal or cancel of an input', async () => {
    const sealer: VoiceRule<null> = { name: 'sealer', initial: () => null, reduce: (state, event) => isEvent(event, inputCapturingEvent)
      ? { state, commands: [{ type: 'seal', inputId: event.body.inputId }, { type: 'cancel', inputId: event.body.inputId, reason: 'late' }] }
      : { state } }
    const harness = createHarness([sealer] as VoiceRule<unknown>[])

    harness.emit(inputBegunEvent, { inputId: 'one', sessionId: 'alice', start: { kind: 'after-silence' } })
    harness.emit(inputCapturingEvent, { inputId: 'one', from: { sourceId: 'mic', frame: 0 } })
    await flush()

    expect(harness.commands).toEqual([{ type: 'seal', inputId: 'one' }])
  })

  it('keeps the transcript revision when the provider republishes the same text', async () => {
    const harness = createHarness([])
    harness.emit(inputBegunEvent, { inputId: 'one', sessionId: 'alice', start: { kind: 'after-silence' } })
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'turn on the light' })
    await flush()
    const read = harness.policy.revisions('one')

    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'turn on the light' })
    await flush()
    expect(harness.policy.isCurrent('one', read)).toBe(true)

    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'turn on the light please' })
    await flush()
    expect(harness.policy.isCurrent('one', read)).toBe(false)
  })
})

describe('createSpeechActivityRule', () => {
  function create(options: Partial<Parameters<typeof createSpeechActivityRule>[0]> = {}) {
    return createSpeechActivityRule({ target: () => ({ sessionId: 'alice', interruptTurns: [] }), minSpeechMs: 64, silenceMs: 96, preRollMs: 0, ...options })
  }

  it('begins an accepted speech onset, counts its first window, and seals after the silence limit', async () => {
    const harness = createHarness([create()] as VoiceRule<unknown>[])
    harness.window(0, 32, 0.9, { accepted: true })
    await flush()
    harness.emit(inputCapturingEvent, { inputId: 'input-1', from: { sourceId: 'mic', frame: 0 } })
    for (const start of [32, 64, 96, 128, 160])
      harness.window(start, 32, start < 96 ? 0.9 : 0)
    await flush()

    expect(harness.commands).toEqual([
      { type: 'begin', input: { sessionId: 'alice', interruptTurns: [], cause: 'speech', start: { kind: 'speech-onset', at: { sourceId: 'mic', frame: 0 }, preRollMs: 0 } } },
      { type: 'seal', inputId: 'input-1', at: { sourceId: 'mic', frame: 192 } },
    ])
    expect(harness.seen.filter(event => isEvent(event, inputActivitySignal)).map(event => (event.body as { speech: boolean }).speech)).toEqual([true, true, true, false, false, false])
  })

  it('counts windows that arrive before a wake input reports its first frame', async () => {
    const harness = createHarness([create()] as VoiceRule<unknown>[])
    void harness.events.emit(speechActivitySignal, { range: { sourceId: 'mic', startFrame: 0, endFrame: 32 }, durationMs: 32, score: 0.9, discontinuity: false, accepted: true, wake: { sessionId: 'alice', interruptTurns: [] } })
    await flush()
    // Capture starts at frame 32 after playback silence. Its VAD windows arrive before the `capturing` event.
    harness.window(32, 32, 0.9)
    harness.window(64, 32, 0.9)
    await flush()
    expect(harness.seen).toEqual([])

    harness.emit(inputCapturingEvent, { inputId: 'input-1', from: { sourceId: 'mic', frame: 32 } })
    await flush()

    expect(harness.seen.map(event => (event.body as { range: { startFrame: number } }).range.startFrame)).toEqual([32, 64])
  })

  // Codex review on PR #2995: the Hearing playground changes its sensitivity and silence sliders while it monitors.
  it('reads a live threshold and silence limit on each window', async () => {
    const settings = { threshold: 0.95, silenceMs: 1000 }
    const harness = createHarness([createSpeechActivityRule({
      target: () => ({ sessionId: 'alice', interruptTurns: [] }),
      minSpeechMs: 32,
      preRollMs: 0,
      get threshold() { return settings.threshold },
      get silenceMs() { return settings.silenceMs },
    })] as VoiceRule<unknown>[])
    harness.window(0, 32, 0.9, { accepted: true })
    await flush()
    expect(harness.commands).toEqual([])

    settings.threshold = 0.6
    harness.window(32, 32, 0.9, { accepted: true })
    await flush()
    expect(harness.commands.map(command => command.type)).toEqual(['begin'])

    harness.emit(inputCapturingEvent, { inputId: 'input-1', from: { sourceId: 'mic', frame: 32 } })
    settings.silenceMs = 64
    harness.window(64, 32, 0)
    harness.window(96, 32, 0)
    await flush()
    expect(harness.commands.at(-1)).toEqual({ type: 'seal', inputId: 'input-1', at: { sourceId: 'mic', frame: 128 } })
  })

  it('does not begin speech that the echo gate did not accept', async () => {
    const harness = createHarness([create()] as VoiceRule<unknown>[])
    harness.window(0, 32, 0.9, { accepted: false })
    harness.window(32, 32, 0.9)
    await flush()

    expect(harness.commands).toEqual([])
  })

  it('cancels its input when silence ends speech that is too short', async () => {
    const harness = createHarness([create()] as VoiceRule<unknown>[])
    harness.window(0, 32, 0.9, { accepted: true })
    await flush()
    harness.emit(inputCapturingEvent, { inputId: 'input-1', from: { sourceId: 'mic', frame: 0 } })
    for (const start of [32, 64, 96])
      harness.window(start, 32, 0)
    await flush()

    expect(harness.commands.at(-1)).toEqual({ type: 'cancel', inputId: 'input-1', reason: 'Speech segment was too short' })
  })

  it('leaves a manual input alone', async () => {
    const harness = createHarness([create()] as VoiceRule<unknown>[])
    harness.emit(inputBegunEvent, { inputId: 'manual', sessionId: 'alice', start: { kind: 'after-silence' }, cause: 'control' })
    harness.emit(inputCapturingEvent, { inputId: 'manual', from: { sourceId: 'mic', frame: 0 } })
    for (const start of [0, 32, 64, 96, 128])
      harness.window(start, 32, start === 0 ? 0.9 : 0, { accepted: true })
    await flush()

    expect(harness.commands).toEqual([])
    expect(harness.seen).toEqual([])
  })

  it('cancels its input when automatic input is paused', async () => {
    let enabled = true
    const harness = createHarness([create({ enabled: () => enabled })] as VoiceRule<unknown>[])
    harness.window(0, 32, 0.9, { accepted: true })
    await flush()
    enabled = false
    harness.window(32, 32, 0.9)
    await flush()

    expect(harness.commands.at(-1)).toEqual({ type: 'cancel', inputId: 'input-1', reason: 'Automatic speech input is paused' })
  })
})

describe('pause and end judgement rules', () => {
  /** Feeds activity windows of one input, as the speech activity rule emits them. */
  function activity(harness: ReturnType<typeof createHarness>, startFrame: number, endFrame: number, speech: boolean) {
    for (let frame = startFrame; frame < endFrame; frame += 32)
      harness.emit(inputActivitySignal, { inputId: 'one', range: { sourceId: 'mic', startFrame: frame, endFrame: frame + 32 }, speech, durationMs: 32 })
  }

  function open(harness: ReturnType<typeof createHarness>) {
    harness.emit(inputBegunEvent, { inputId: 'one', sessionId: 'alice', start: { kind: 'after-silence' } })
    harness.emit(inputCapturingEvent, { inputId: 'one', from: { sourceId: 'mic', frame: 0 } })
  }

  function pauses(harness: ReturnType<typeof createHarness>) {
    return harness.seen.filter(event => isEvent(event, pausedSignal)) as (Eventa<unknown> & { body: { text: string, readAt: Record<string, number> } })[]
  }

  it('reports one pause after speech, and no pause before the first speech', async () => {
    const harness = createHarness([createPauseRule({ pauseMs: 1200 })] as VoiceRule<unknown>[])
    open(harness)
    activity(harness, 0, 2000, false)
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'what time is it' })
    activity(harness, 2000, 2512, true)
    activity(harness, 2512, 5000, false)
    await flush()

    expect(pauses(harness).map(event => event.body.text)).toEqual(['what time is it'])
  })

  it('seals on a current complete judgement and ignores a judgement after new speech', async () => {
    const harness = createHarness([createPauseRule({ pauseMs: 1200 }), createEndJudgementRule()] as VoiceRule<unknown>[])
    open(harness)
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'remind me to' })
    activity(harness, 0, 512, true)
    activity(harness, 512, 1800, false)
    await flush()
    const stale = pauses(harness)[0]!.body.readAt

    activity(harness, 1800, 2304, true)
    harness.emit(endJudgedSignal, { inputId: 'one', result: 'complete', readAt: stale })
    await flush()
    expect(harness.commands).toEqual([])

    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'remind me to buy milk' })
    activity(harness, 2304, 3600, false)
    await flush()
    harness.emit(endJudgedSignal, { inputId: 'one', result: 'complete', readAt: pauses(harness).at(-1)!.body.readAt })
    await flush()
    expect(harness.commands).toEqual([{ type: 'seal', inputId: 'one' }])
  })

  // Replays the timing of IO trace 06e9aacc, saved on 2026-10-13. The last speech ended at 2944 ms. Three judgements
  // were cancelled while the provider republished the same text, and the 4.2 s silence limit ended the input at 7181 ms.
  it('keeps a judgement while the provider republishes the same text (trace 06e9aacc)', async () => {
    const harness = createHarness([createPauseRule({ pauseMs: 1200 }), createEndJudgementRule()] as VoiceRule<unknown>[])
    open(harness)
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'hey airi what is the weather' })
    activity(harness, 0, 2048, false)
    activity(harness, 2048, 2240, true)
    activity(harness, 2240, 2688, false)
    activity(harness, 2688, 2944, true)
    activity(harness, 2944, 4160, false)
    await flush()
    const judged = pauses(harness).at(-1)!

    // The provider marks the text final twice during the judgement. The text does not change.
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'hey airi what is the weather' })
    activity(harness, 4160, 4704, false)
    harness.emit(inputTranscriptEvent, { inputId: 'one', text: 'hey airi what is the weather' })
    harness.emit(endJudgedSignal, { inputId: 'one', result: 'complete', readAt: judged.body.readAt })
    await flush()

    expect(harness.commands).toEqual([{ type: 'seal', inputId: 'one' }])
    // The judgement started 1.2 s after the last speech, about 3 s before the silence limit.
    expect(judged.body.text).toBe('hey airi what is the weather')
  })

  it('forgets an input after it settles', async () => {
    const harness = createHarness([createEndJudgementRule()] as VoiceRule<unknown>[])
    open(harness)
    await flush()
    const readAt = harness.policy.revisions('one')
    harness.emit(inputSettledEvent, { inputId: 'one', outcome: { status: 'cancelled', reason: 'done' } })
    harness.emit(endJudgedSignal, { inputId: 'one', result: 'complete', readAt })
    await flush()

    expect(harness.commands).toEqual([])
    expect(harness.policy.revisions('one')).toEqual({})
  })
})
