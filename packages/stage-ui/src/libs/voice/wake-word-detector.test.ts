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

/** Sends windows until one completes a 100 ms batch. 512-sample windows complete it on the fourth window. */
async function detectBatch(detector: WakeWordDetector, signal = new AbortController().signal) {
  for (let index = 0; index < 3; index++)
    expect(await detector.detect(audioWindow(index), signal)).toBeUndefined()

  return detector.detect(audioWindow(3), signal)
}

describe('wakeWordDetector', () => {
  it('maps a match through the active catalog to the character session', async () => {
    const harness = createHarness()
    const [alice, bob] = pronunciations([
      { characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] },
      { characterId: 'bob', text: 'Bob', tokens: [['B', 'AA1', 'B']] },
    ])
    await harness.detector.setPronunciations([alice!, bob!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(bob!)])

    const target = await detectBatch(harness.detector)

    expect(harness.createSpotter).toHaveBeenCalledWith([
      { label: alice!.key, matches: [{ tokens: ['AE1', 'L', 'IH0', 'S'] }] },
      { label: bob!.key, matches: [{ tokens: ['B', 'AA1', 'B'] }] },
    ])
    expect(harness.spotter.processAudio).toHaveBeenCalledOnce()
    expect(harness.spotter.processAudio.mock.calls[0]![0]).toHaveLength(2048)
    expect(harness.spotter.processAudio.mock.calls[0]![1]).toBe(16_000)
    expect(harness.resolveTarget).toHaveBeenCalledWith('bob', expect.any(AbortSignal))
    expect(target).toEqual({ sessionId: 'session-bob', interruptTurns: [] })
    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('ready')
  })

  it('ignores a late result after stop', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    const pending = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(pending.promise)

    const result = detectBatch(harness.detector)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    harness.detector.stop()
    pending.resolve([detection(alice!)])

    expect(await result).toBeUndefined()
    expect(harness.resolveTarget).not.toHaveBeenCalled()
    expect(harness.spotter.dispose).toHaveBeenCalledOnce()
  })

  it('ignores a late result after the window signal aborts', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1', 'L', 'IH0', 'S']] }])
    await harness.detector.setPronunciations([alice!])
    const pending = Promise.withResolvers<Detection[]>()
    harness.spotter.processAudio.mockReturnValueOnce(pending.promise)
    const abort = new AbortController()

    const result = detectBatch(harness.detector, abort.signal)
    await vi.waitFor(() => expect(harness.spotter.processAudio).toHaveBeenCalledOnce())
    abort.abort('Audio observer closed')
    pending.resolve([detection(alice!)])

    expect(await result).toBeUndefined()
    expect(harness.resolveTarget).not.toHaveBeenCalled()
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
    expect(await detectBatch(harness.detector)).toBeUndefined()
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

    const target = await detectBatch(harness.detector)

    expect(harness.spotter.setKeywords).not.toHaveBeenCalled()
    expect(target).toEqual({ sessionId: 'session-other', interruptTurns: [] })
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

    expect(harness.spotter.reset).toHaveBeenCalledOnce()
    expect(harness.spotter.processAudio).not.toHaveBeenCalled()
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

    expect(await detectBatch(harness.detector)).toBeUndefined()

    expect(harness.onPreparationChange).toHaveBeenLastCalledWith('error', 'worker crashed')
    expect(harness.detector.ready).toBe(false)
  })
  it('reports a failed session selection and keeps recognizing', async () => {
    const harness = createHarness()
    const [alice] = pronunciations([{ characterId: 'alice', text: 'Alice', tokens: [['AE1']] }])
    await harness.detector.setPronunciations([alice!])
    harness.spotter.processAudio.mockResolvedValueOnce([detection(alice!)])
    harness.resolveTarget.mockRejectedValueOnce(new Error('Character is unavailable'))

    expect(await detectBatch(harness.detector)).toBeUndefined()

    expect(harness.onError).toHaveBeenCalledWith(new Error('Character is unavailable'))
    expect(harness.detector.ready).toBe(true)
  })
})
