import type { SpeechInputAttempt, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { createVoiceRephrasePlugin } from './voice-rephrase-plugin'

function createHarness(rephrase: (text: string, signal: AbortSignal) => Promise<string>, enabled = true) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async () => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  controller.use(createVoiceRephrasePlugin({ enabled: () => enabled, rephrase, timeoutMs: 1000 }), { grants: ['transcript-patch'] })

  async function speak(updates: readonly { text: string, final: boolean }[][]): Promise<SpeechInputAttempt> {
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    updates.forEach((segments, index) => {
      output.write({ type: 'update', revision: index + 1, segments: segments.map((segment, position) => ({ id: `speech-${position}`, revision: index + 1, text: segment.text, tokens: [], final: segment.final })) })
    })
    void attempt.end()
    output.write({ type: 'complete', revision: updates.length })
    output.close()
    await attempt.done
    return attempt
  }

  return { controller, submit, speak }
}

describe('createVoiceRephrasePlugin', () => {
  it('submits the rewritten final text and keeps the provider text as raw history', async () => {
    const rephrase = vi.fn(async () => 'Check the weather in Shanghai tomorrow.')
    const { controller, submit, speak } = createHarness(rephrase)

    const attempt = await speak([
      [{ text: 'um check the ', final: false }],
      [{ text: 'um check the weather. ', final: true }, { text: 'Shanghai tomorrow', final: true }],
    ])

    expect(rephrase).toHaveBeenCalledOnce()
    expect(rephrase).toHaveBeenCalledWith('um check the weather. Shanghai tomorrow', expect.any(AbortSignal))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Check the weather in Shanghai tomorrow.' }), expect.any(AbortSignal))
    expect(attempt.input?.transcript.raw.text).toBe('um check the weather. Shanghai tomorrow')
    await controller.close()
  })

  it('submits the provider text when rephrasing is disabled', async () => {
    const rephrase = vi.fn(async () => 'rewritten')
    const { controller, submit, speak } = createHarness(rephrase, false)

    await speak([[{ text: 'hello there', final: true }]])

    expect(rephrase).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello there' }), expect.any(AbortSignal))
    await controller.close()
  })

  it('submits the provider text when the model fails', async () => {
    const { controller, submit, speak } = createHarness(async () => {
      throw new Error('model unavailable')
    })

    await speak([[{ text: 'hello there', final: true }]])

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello there' }), expect.any(AbortSignal))
    await controller.close()
  })
})
