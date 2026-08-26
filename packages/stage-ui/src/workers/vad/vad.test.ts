import type { PreTrainedModel } from '@huggingface/transformers'

import { AutoModel } from '@huggingface/transformers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VAD } from './vad'

vi.mock('@huggingface/transformers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@huggingface/transformers')>()

  return {
    ...actual,
    AutoModel: {
      from_pretrained: vi.fn(),
    },
  }
})

function createProbabilityModel(probabilities: number[]) {
  return vi.fn(async (input: { state: unknown }) => ({
    stateN: input.state,
    output: {
      data: new Float32Array([probabilities.shift() ?? 0]),
    },
  })) as unknown as PreTrainedModel
}

describe('vad speech duration', () => {
  beforeEach(() => {
    vi.mocked(AutoModel.from_pretrained).mockReset()
  })

  it('rejects a noise pulse that is shorter than the minimum speech duration', async () => {
    // ROOT CAUSE:
    //
    // The minimum speech check used the full segment buffer. That buffer also
    // contained the silence that closed the segment. An 800 ms silence period
    // therefore made a short noise pulse pass a 300 ms speech requirement.
    //
    // We count detected speech samples separately from post-speech silence.
    const probabilities = [0.9, ...Array.from<number>({ length: 80 }).fill(0)]
    vi.mocked(AutoModel.from_pretrained).mockResolvedValue(createProbabilityModel(probabilities))
    const vad = new VAD({
      sampleRate: 16000,
      newBufferSize: 160,
      minSilenceDurationMs: 800,
      minSpeechDurationMs: 300,
    })
    const onSpeechReady = vi.fn()
    const onSpeechCancel = vi.fn()
    vad.on('speech-ready', onSpeechReady)
    vad.on('speech-cancel', onSpeechCancel)

    await vad.initialize()
    for (let index = 0; index < 81; index++)
      await vad.processAudio(new Float32Array(160))

    expect(onSpeechReady).not.toHaveBeenCalled()
    expect(onSpeechCancel).toHaveBeenCalledOnce()
  })

  it('keeps speech that reaches the minimum speech duration', async () => {
    const probabilities = [
      ...Array.from<number>({ length: 30 }).fill(0.9),
      ...Array.from<number>({ length: 80 }).fill(0),
    ]
    vi.mocked(AutoModel.from_pretrained).mockResolvedValue(createProbabilityModel(probabilities))
    const vad = new VAD({
      sampleRate: 16000,
      newBufferSize: 160,
      minSilenceDurationMs: 800,
      minSpeechDurationMs: 300,
    })
    const onSpeechReady = vi.fn()
    vad.on('speech-ready', onSpeechReady)

    await vad.initialize()
    for (let index = 0; index < 110; index++)
      await vad.processAudio(new Float32Array(160))

    expect(onSpeechReady).toHaveBeenCalledOnce()
  })

  it('serializes overlapping worklet callbacks across consecutive speech segments', async () => {
    // ROOT CAUSE:
    //
    // AudioWorklet message handlers do not wait for an async callback to finish.
    // Concurrent processAudio calls therefore captured the same stale recording
    // state even though model inference itself was queued. The first segment
    // could complete while the second segment never reached a valid transition.
    //
    // We serialize the complete detection and state transition for every chunk.
    const probabilities = [
      ...Array.from<number>({ length: 30 }).fill(0.9),
      ...Array.from<number>({ length: 80 }).fill(0),
      ...Array.from<number>({ length: 30 }).fill(0.9),
      ...Array.from<number>({ length: 80 }).fill(0),
    ]
    vi.mocked(AutoModel.from_pretrained).mockResolvedValue(createProbabilityModel(probabilities))
    const vad = new VAD({
      sampleRate: 16000,
      newBufferSize: 160,
      minSilenceDurationMs: 800,
      minSpeechDurationMs: 300,
    })
    const onSpeechReady = vi.fn()
    vad.on('speech-ready', onSpeechReady)

    await vad.initialize()
    await Promise.all(Array.from({ length: 220 }, () => vad.processAudio(new Float32Array(160))))

    expect(onSpeechReady).toHaveBeenCalledTimes(2)
  })
})
