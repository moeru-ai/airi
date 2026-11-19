import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'
import type { Detection, KeywordEntry, KeywordSpotter } from '@sherpaw/kws'

import type { WakeWordDetectorOptions } from './wake-word-detector'
import type { WakePronunciation } from './wake-words'

import { AudioInput } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it, vi } from 'vitest'

import { WakeWordDetector } from './wake-word-detector'
import { resolveWakeWords } from './wake-words'

const modelId = 'kws-zh-en'

/** 100 ms at 16 kHz, one recognition batch and one window of the detector's own observation. */
const BATCH = 1600

function pronunciations(cards: { characterId: string, text: string, tokens: string[][], modelId?: string }[]) {
  return resolveWakeWords(cards.map(card => ({ characterId: card.characterId, words: [{ text: card.text, modelId: card.modelId ?? modelId, pronunciations: card.tokens }] })), {}).active
}

/** A live microphone that the test drives. The detector listens to it through a shared input, as in production. */
function createMicrophone() {
  let stream: ReturnType<typeof createPushStream<PcmBlock>> | undefined
  const source: LiveAudioSource = {
    live: true,
    open: () => {
      stream = createPushStream<PcmBlock>()
      return stream.stream
    },
  }
  let frame = 0
  return {
    input: new AudioInput(source),
    /** Writes one block. `gap` skips frames, which the input reports as a discontinuity. */
    write(samples: Float32Array | readonly Float32Array[] = new Float32Array(BATCH), options: { gap?: number } = {}) {
      const channels = Array.isArray(samples) ? samples : [samples as Float32Array]
      frame += options.gap ?? 0
      stream!.write({ range: { sourceId: 'mic', startFrame: frame, endFrame: frame + channels[0]!.length }, sampleRate: 16_000, channels })
      frame += channels[0]!.length
    },
  }
}

function createHarness(options: Partial<WakeWordDetectorOptions> = {}) {
  const spotter = {
    processAudio: vi.fn<KeywordSpotter['processAudio']>(async () => []),
    setKeywords: vi.fn<KeywordSpotter['setKeywords']>(async () => {}),
    reset: vi.fn<KeywordSpotter['reset']>(async () => {}),
    dispose: vi.fn<KeywordSpotter['dispose']>(),
  }
  const createSpotter = vi.fn(async (_keywords: readonly KeywordEntry[]) => spotter)
  const resolveTarget = vi.fn(async (characterId: string) => ({ sessionId: `session-${characterId}`, interruptTurns: [] }))
  const onPreparationChange = vi.fn()
  const onError = vi.fn()
  const detector = new WakeWordDetector({ modelId, createSpotter, resolveTarget, onPreparationChange, onError, ...options })
  const microphone = createMicrophone()
  const listening = new AbortController()
  detector.listen(microphone.input, listening.signal)
  return { spotter, createSpotter, resolveTarget, onPreparationChange, onError, detector, microphone, listening }
}

function detection(pronunciation: WakePronunciation): Detection {
  return { label: pronunciation.key, tokens: [...pronunciation.tokens], startTime: 0, timestamps: [0] }
}

/** Returns the wake that background recognition delivers on a later VAD window. */
async function nextWake(detector: WakeWordDetector, signal = new AbortController().signal) {
  let target: ReturnType<WakeWordDetector['take']>
  await vi.waitFor(() => {
    target = detector.take(signal)
    expect(target).toBeDefined()
  })
  return target
}

const silence = { speech: false, durationMs: 300 } as const
const speech = { speech: true, durationMs: 32 } as const

describe('wakeWordDetector', () => {
  it('maps a match through the active catalog to the character session on a later VAD window', async () => {
    const harness = createHarness()
    const [alice, bob] = pronunciations([
      { characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] },
      { characterId: 'bob', text: 'Bob', tokens: [['B', 'AA1', 'B']] },
    ])
    await harness.detector.setPronunciations([alice!, bob!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(bob!)])

    harness.microphone.write()
    const target = await nextWake(harness.detector)

    expect(harness.createSpotter).toHaveBeenCalledWith([
      { label: alice!.key, matches: [{ tokens: ['AE1', 'L', 'IH0', 'S'] }] },
      { label: bob!.key, matches: [{ tokens: ['B', 'AA1', 'B'] }] },
    ])
    expect(harness.spotter.processAudio.mock.calls[0]![0]).toHaveLength(BATCH)
    expect(harness.spotter.processAudio.mock.calls[0]![1]).toBe(16_000)
    expect(harness.resolveTarget).toHaveBeenCalledWith('bob', expect.any(AbortSignal), bob)
    expect(target).toEqual({ sessionId: 'session-bob', interruptTurns: [] })
    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('ready')
  })

  it('adds search settings and variants, and keeps each token sequence with its first owner', async () => {
    const variants = vi.fn((tokens: readonly string[]) => tokens[0] === 'h' ? [['h', 'èi'], ['b', 'ā']] : [['b', 'à']])
    const harness = createHarness({ search: { score: 1.5, threshold: 0.1 }, variants })
    const [hey, ba] = pronunciations([
      { characterId: 'alice', text: 'Hey', tokens: [['h', 'ēi']] },
      { characterId: 'bob', text: 'Ba', tokens: [['b', 'ā']] },
    ])

    await harness.detector.setPronunciations([hey!, ba!])

    expect(harness.createSpotter).toHaveBeenCalledWith([
      // `b ā` is a card pronunciation of Bob, so the variant of Alice does not claim it.
      { label: hey!.key, score: 1.5, threshold: 0.1, matches: [{ tokens: ['h', 'ēi'] }, { tokens: ['h', 'èi'] }] },
      { label: ba!.key, score: 1.5, threshold: 0.1, matches: [{ tokens: ['b', 'ā'] }, { tokens: ['b', 'à'] }] },
    ])
  })

  it('starts a new stream once per VAD pause', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const signal = new AbortController().signal

    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledTimes(1))
    // 300 ms and then 600 ms of non-speech cross the 500 ms limit once. Later silence does not reset again.
    harness.detector.take(signal, silence)
    harness.detector.take(signal, silence)
    harness.detector.take(signal, silence)
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledTimes(2))
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledTimes(3))

    expect(harness.spotter.reset).toHaveBeenCalledOnce()
    expect(harness.spotter.reset.mock.invocationCallOrder[0]).toBeGreaterThan(harness.spotter.processAudio.mock.invocationCallOrder[0]!)
    expect(harness.spotter.reset.mock.invocationCallOrder[0]).toBeLessThan(harness.spotter.processAudio.mock.invocationCallOrder[1]!)

    // Speech ends the pause, so the next pause resets again.
    harness.detector.take(signal, speech)
    harness.detector.take(signal, silence)
    harness.detector.take(signal, silence)
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledTimes(4))

    expect(harness.spotter.reset).toHaveBeenCalledTimes(2)
  })

  it('stops feeding recognition when the listen signal aborts', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())

    harness.listening.abort('Wake word input changed')

    await expect.poll(() => harness.microphone.input.position).toBeUndefined()
    expect(harness.spotter.processAudio).toHaveBeenCalledOnce()
  })

  it('ignores a late result after stop', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    const pending = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(pending.promise)

    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    harness.detector.stop()
    pending.resolve([detection(alice!)])
    await harness.detector.setPronunciations([alice!])

    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
    expect(harness.resolveTarget).not.toHaveBeenCalled()
    expect(harness.spotter.dispose).toHaveBeenCalledOnce()
  })

  it('keeps a wake for the next VAD window when the current window aborts', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.resolveTarget).toHaveBeenCalledOnce())
    const aborted = new AbortController()
    aborted.abort('Audio observer closed')

    expect(harness.detector.take(aborted.signal)).toBeUndefined()
    expect(await nextWake(harness.detector)).toEqual({ sessionId: 'session-alice', interruptTurns: [] })
  })

  it('does not wait for a Worker that is slower than real time, and drops stale audio', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const stalled = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(stalled.promise)

    // 2 seconds of audio while the first Worker call does not finish.
    for (let index = 0; index < 20; index++)
      harness.microphone.write()
    await expect.poll(() => harness.microphone.input.position?.frame).toBe(20 * BATCH)

    expect(harness.spotter.processAudio).toHaveBeenCalledOnce()
    stalled.resolve([])
    await vi.waitFor(() => expect(harness.spotter.processAudio.mock.calls.length).toBeGreaterThan(1))
    // The backlog passed 1 second, so the detector dropped it and started a new stream.
    expect(harness.spotter.reset).toHaveBeenCalled()
    expect(harness.spotter.processAudio.mock.calls.length).toBeLessThan(16)
  })

  it('rebuilds keywords when the catalog changes and drops matches of removed pronunciations', async () => {
    const harness = createHarness()
    const [alice, bob] = pronunciations([
      { characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] },
      { characterId: 'bob', text: 'Bob', tokens: [['B', 'AA1', 'B']] },
    ])
    await harness.detector.setPronunciations([alice!])
    await harness.detector.setPronunciations([bob!])

    expect(harness.createSpotter).toHaveBeenCalledOnce()
    expect(harness.spotter.setKeywords).toHaveBeenCalledWith([{ label: bob!.key, matches: [{ tokens: ['B', 'AA1', 'B'] }] }])

    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    harness.microphone.write()
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
    expect(harness.resolveTarget).not.toHaveBeenCalled()

    await harness.detector.setPronunciations([])
    expect(harness.spotter.setKeywords).toHaveBeenLastCalledWith([])
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('unconfigured')
    expect(harness.detector.ready).toBe(false)
  })

  it('keeps the spotter keywords when only the owner of a pronunciation changes', async () => {
    const harness = createHarness()
    const shared = [['AE1', 'L', 'IH0', 'S']]
    const cards = [{ characterId: 'alice', words: [{ text: 'Alice', modelId, pronunciations: shared }] }, { characterId: 'other', words: [{ text: 'Alice', modelId, pronunciations: shared }] }]
    const key = JSON.stringify([modelId, shared[0]])
    await harness.detector.setPronunciations(resolveWakeWords(cards, { [key]: 'alice' }).active)
    await harness.detector.setPronunciations(resolveWakeWords(cards, { [key]: 'other' }).active)
    harness.spotter.processAudio.mockResolvedValueOnce([{ label: key, tokens: shared[0]!, startTime: 0, timestamps: [0] }])

    harness.microphone.write()

    expect(await nextWake(harness.detector)).toEqual({ sessionId: 'session-other', interruptTurns: [] })
    expect(harness.spotter.setKeywords).not.toHaveBeenCalled()
  })

  it('becomes ready when the same catalog arrives again while the spotter is loading', async () => {
    let finishLoad!: () => void
    const loaded = new Promise<void>(resolve => finishLoad = resolve)
    const harness = createHarness()
    harness.createSpotter.mockImplementationOnce(async () => {
      await loaded
      return harness.spotter
    })
    const catalog = () => pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])

    // A reactive catalog can emit an equal list again, for example after the card store hydrates.
    const first = harness.detector.setPronunciations(catalog())
    const second = harness.detector.setPronunciations(catalog())
    finishLoad()
    await Promise.all([first, second])

    expect(harness.createSpotter).toHaveBeenCalledTimes(1)
    expect(harness.detector.ready).toBe(true)
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('ready')
  })

  it('does not load a model for pronunciations of another model', async () => {
    const harness = createHarness()

    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['a']], modelId: 'other-model' }]))
    harness.microphone.write()
    await expect.poll(() => harness.microphone.input.position?.frame).toBe(BATCH)

    expect(harness.createSpotter).not.toHaveBeenCalled()
    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
  })

  it('sanitizes non-finite samples and downmixes channels before recognition', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const channel = new Float32Array(BATCH)
    channel.set([1.5, -1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.25])

    harness.microphone.write([channel, channel])
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())

    const samples = harness.spotter.processAudio.mock.calls[0]![0]
    expect(samples.slice(0, 6)).toEqual(new Float32Array([1, -1, 0, 0, 0, 0.25]))
    expect(samples.every(Number.isFinite)).toBe(true)
  })

  it('starts a new stream after a discontinuity', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))

    harness.microphone.write(new Float32Array(800))
    harness.microphone.write(new Float32Array(BATCH), { gap: 10_000 })
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())

    expect(harness.spotter.reset).toHaveBeenCalledOnce()
    expect(harness.spotter.reset.mock.invocationCallOrder[0]).toBeLessThan(harness.spotter.processAudio.mock.invocationCallOrder[0]!)
    expect(harness.spotter.processAudio.mock.calls[0]![0]).toHaveLength(BATCH)
  })

  it('reports a failed model load as an error and returns no target', async () => {
    const harness = createHarness()
    harness.createSpotter.mockRejectedValueOnce(new Error('download failed'))

    await expect(harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))).rejects.toThrow('download failed')

    expect(harness.onPreparationChange).toHaveBeenNthCalledWith(1, 'preparing')
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('error', 'download failed')
    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
  })

  it('reports a recognition failure without ending the observation', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    harness.spotter.processAudio.mockRejectedValueOnce(new Error('worker crashed'))

    harness.microphone.write()

    await vi.waitFor(() => expect(harness.onPreparationChange).toHaveBeenLastCalledWith('error', 'worker crashed'))
    expect(harness.detector.ready).toBe(false)
  })

  it('reports a failed session selection and keeps recognizing', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }])
    await harness.detector.setPronunciations([alice!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    harness.resolveTarget.mockRejectedValueOnce(new Error('Character is unavailable'))

    harness.microphone.write()

    await vi.waitFor(() => expect(harness.onError).toHaveBeenCalledWith(new Error('Character is unavailable')))
    expect(harness.detector.take(new AbortController().signal)).toBeUndefined()
    expect(harness.detector.ready).toBe(true)
  })
})
