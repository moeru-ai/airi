import type { AudioWindow } from '@proj-airi/pipelines-audio'
import type { Detection, KeywordEntry, KeywordSpotter } from '@sherpaw/kws'

import type { WakePronunciation } from './wake-words'

import { describe, expect, it, vi } from 'vitest'

import { WakeWordDetector } from './wake-word-detector'
import { resolveWakeWords } from './wake-words'

const modelId = 'kws-zh-en'

/** One 32 ms window at 16 kHz, the shape that the voice activity plugin observes. */
function audioWindow(index: number, values: readonly number[] = [], options: { discontinuity?: boolean, channels?: number } = {}): AudioWindow {
  const channel = new Float32Array(512)
  channel.set(values)
  return {
    range: { sourceId: 'mic', startFrame: index * 512, endFrame: (index + 1) * 512 },
    sampleRate: 16_000,
    channels: Array.from<Float32Array>({ length: options.channels ?? 1 }).fill(channel),
    discontinuity: options.discontinuity ?? false,
  }
}

function pronunciations(cards: { characterId: string, text: string, tokens: string[][], modelId?: string }[]) {
  return resolveWakeWords(cards.map(card => ({ characterId: card.characterId, words: [{ text: card.text, modelId: card.modelId ?? modelId, pronunciations: card.tokens }] })), {}).active
}

function createHarness() {
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
  const detector = new WakeWordDetector({ modelId, createSpotter, resolveTarget, onPreparationChange, onError })
  return { spotter, createSpotter, resolveTarget, onPreparationChange, onError, detector }
}

function detection(pronunciation: WakePronunciation): Detection {
  return { label: pronunciation.key, tokens: [...pronunciation.tokens], startTime: 0, timestamps: [0] }
}

/**
 * Sends one 100 ms batch. 512-sample windows complete it on the fourth window.
 * Recognition runs in the background, so every window returns at once without a target.
 */
async function sendBatch(detector: WakeWordDetector, start = 0, signal = new AbortController().signal) {
  for (let index = start; index < start + 4; index++)
    expect(await detector.detect(audioWindow(index), signal)).toBeUndefined()
}

/** Returns the wake that background recognition delivers on a later window. */
async function nextWake(detector: WakeWordDetector, signal = new AbortController().signal) {
  let target: Awaited<ReturnType<WakeWordDetector['detect']>>
  let index = 100
  await vi.waitFor(async () => {
    target = await detector.detect(audioWindow(index++), signal)
    expect(target).toBeDefined()
  })
  return target
}

describe('wakeWordDetector', () => {
  it('maps a match through the active catalog to the character session on a later window', async () => {
    const harness = createHarness()
    const [alice, bob] = pronunciations([
      { characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] },
      { characterId: 'bob', text: 'Bob', tokens: [['B', 'AA1', 'B']] },
    ])
    await harness.detector.setPronunciations([alice!, bob!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(bob!)])

    await sendBatch(harness.detector)
    const target = await nextWake(harness.detector)

    expect(harness.createSpotter).toHaveBeenCalledWith([
      { label: alice!.key, matches: [{ tokens: ['AE1', 'L', 'IH0', 'S'] }] },
      { label: bob!.key, matches: [{ tokens: ['B', 'AA1', 'B'] }] },
    ])
    expect(harness.spotter.processAudio.mock.calls[0]![0]).toHaveLength(2048)
    expect(harness.spotter.processAudio.mock.calls[0]![1]).toBe(16_000)
    expect(harness.resolveTarget).toHaveBeenCalledWith('bob', expect.any(AbortSignal))
    expect(target).toEqual({ sessionId: 'session-bob', interruptTurns: [] })
    expect(await harness.detector.detect(audioWindow(200), new AbortController().signal)).toBeUndefined()
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('ready')
  })

  it('ignores a late result after stop', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    const pending = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(pending.promise)

    await sendBatch(harness.detector)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    harness.detector.stop()
    pending.resolve([detection(alice!)])
    await harness.detector.setPronunciations([alice!])

    expect(await harness.detector.detect(audioWindow(10), new AbortController().signal)).toBeUndefined()
    expect(harness.resolveTarget).not.toHaveBeenCalled()
    expect(harness.spotter.dispose).toHaveBeenCalledOnce()
  })

  it('keeps a wake for the next window when the current window aborts', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    await sendBatch(harness.detector)
    await vi.waitFor(() => expect(harness.resolveTarget).toHaveBeenCalledOnce())
    const aborted = new AbortController()
    aborted.abort('Audio observer closed')

    expect(await harness.detector.detect(audioWindow(10), aborted.signal)).toBeUndefined()
    expect(await nextWake(harness.detector)).toEqual({ sessionId: 'session-alice', interruptTurns: [] })
  })

  it('does not wait for a Worker that is slower than real time, and drops stale audio', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const stalled = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(stalled.promise)
    const signal = new AbortController().signal

    // 2 seconds of windows while the first Worker call does not finish.
    for (let index = 0; index < 64; index++)
      expect(await harness.detector.detect(audioWindow(index), signal)).toBeUndefined()

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
    await sendBatch(harness.detector)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    expect(await harness.detector.detect(audioWindow(10), new AbortController().signal)).toBeUndefined()
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

    await sendBatch(harness.detector)

    expect(await nextWake(harness.detector)).toEqual({ sessionId: 'session-other', interruptTurns: [] })
    expect(harness.spotter.setKeywords).not.toHaveBeenCalled()
  })

  it('does not load a model for pronunciations of another model', async () => {
    const harness = createHarness()

    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['a']], modelId: 'other-model' }]))

    expect(harness.createSpotter).not.toHaveBeenCalled()
    expect(await harness.detector.detect(audioWindow(0), new AbortController().signal)).toBeUndefined()
  })

  it('sanitizes non-finite samples and downmixes channels before recognition', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const signal = new AbortController().signal

    await harness.detector.detect(audioWindow(0, [1.5, -1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.25], { channels: 2 }), signal)
    for (let index = 1; index < 4; index++)
      await harness.detector.detect(audioWindow(index), signal)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())

    const samples = harness.spotter.processAudio.mock.calls[0]![0]
    expect(samples.slice(0, 6)).toEqual(new Float32Array([1, -1, 0, 0, 0, 0.25]))
    expect(samples.every(Number.isFinite)).toBe(true)
  })

  it('starts a new stream after a discontinuity', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    const signal = new AbortController().signal

    await harness.detector.detect(audioWindow(0), signal)
    await harness.detector.detect(audioWindow(1), signal)
    await harness.detector.detect(audioWindow(10, [], { discontinuity: true }), signal)
    for (let index = 11; index < 14; index++)
      await harness.detector.detect(audioWindow(index), signal)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())

    expect(harness.spotter.reset).toHaveBeenCalledOnce()
    expect(harness.spotter.reset.mock.invocationCallOrder[0]).toBeLessThan(harness.spotter.processAudio.mock.invocationCallOrder[0]!)
    expect(harness.spotter.processAudio.mock.calls[0]![0]).toHaveLength(2048)
  })

  it('reports a failed model load as an error and returns no target', async () => {
    const harness = createHarness()
    harness.createSpotter.mockRejectedValueOnce(new Error('download failed'))

    await expect(harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))).rejects.toThrow('download failed')

    expect(harness.onPreparationChange).toHaveBeenNthCalledWith(1, 'preparing')
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('error', 'download failed')
    expect(await harness.detector.detect(audioWindow(0), new AbortController().signal)).toBeUndefined()
  })

  it('reports a recognition failure without rejecting the observer callback', async () => {
    const harness = createHarness()
    await harness.detector.setPronunciations(pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }]))
    harness.spotter.processAudio.mockRejectedValueOnce(new Error('worker crashed'))

    await sendBatch(harness.detector)

    await vi.waitFor(() => expect(harness.onPreparationChange).toHaveBeenLastCalledWith('error', 'worker crashed'))
    expect(harness.detector.ready).toBe(false)
  })

  it('reports a failed session selection and keeps recognizing', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }])
    await harness.detector.setPronunciations([alice!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    harness.resolveTarget.mockRejectedValueOnce(new Error('Character is unavailable'))

    await sendBatch(harness.detector)

    await vi.waitFor(() => expect(harness.onError).toHaveBeenCalledWith(new Error('Character is unavailable')))
    expect(await harness.detector.detect(audioWindow(10), new AbortController().signal)).toBeUndefined()
    expect(harness.detector.ready).toBe(true)
  })
})
