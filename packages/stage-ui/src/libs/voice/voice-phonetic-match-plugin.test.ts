import type { SpeechInputAttempt, SpeechSubmission, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { PhoneticVocabularyEntry } from './phonetic-vocabulary'
import type { VoicePhoneticMatchOptions } from './voice-phonetic-match-plugin'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { createVoicePhoneticMatchPlugin, PHONETIC_SUGGESTIONS_KEY } from './voice-phonetic-match-plugin'

const sulfurCube: PhoneticVocabularyEntry = {
  term: 'Sulfur Cube',
  writtenForms: ['硫方怪'],
  pronunciations: [['l', 'iú', 'f', 'āng', 'g', 'uài']],
  description: 'A cube-shaped Minecraft mob that lives near sulfur springs.',
  source: 'minecraft-wiki',
}

function createHarness(vocabulary: readonly PhoneticVocabularyEntry[], rerank?: VoicePhoneticMatchOptions['rerank']) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream })
  const output = createPushStream<TranscriptionEvent>()
  const submit = vi.fn(async (_submission: SpeechSubmission) => ({ status: 'drafted' as const, draftId: 'draft' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: () => output.stream }) })
  const onError = vi.fn()
  controller.use(createVoicePhoneticMatchPlugin({ vocabulary: () => vocabulary, rerank }), { onError })

  async function speak(text: string): Promise<SpeechInputAttempt> {
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [], start: { kind: 'after-silence' } })
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array(4)] })
    await expect.poll(() => attempt.state.phase).toBe('capturing')
    output.write({ type: 'update', revision: 1, segments: [{ id: 'speech-0', revision: 1, text, tokens: [], final: true }] })
    void attempt.end()
    output.write({ type: 'complete', revision: 1 })
    output.close()
    await attempt.done
    return attempt
  }

  return { controller, submit, speak, onError }
}

describe('createVoicePhoneticMatchPlugin', () => {
  it('publishes a suggestion as context and keeps the transcript unchanged', async () => {
    const { controller, submit, speak, onError } = createHarness([sulfurCube])

    await speak('我遇到了一只流氓怪')

    const submission = submit.mock.calls[0][0]
    expect(submission.text).toBe('我遇到了一只流氓怪')
    expect(submission.context).toEqual([expect.objectContaining({
      plugin: 'voice-phonetic-match',
      key: PHONETIC_SUGGESTIONS_KEY,
      value: {
        note: expect.any(String),
        items: [{ span: '流氓怪', candidate: '硫方怪', term: 'Sulfur Cube', score: expect.any(Number), source: 'minecraft-wiki', description: sulfurCube.description }],
      },
    })])
    expect(onError).not.toHaveBeenCalled()
    await controller.close()
  })

  it('lets a reranker choose between two terms for the same span', async () => {
    // By sound alone, 六芒怪 is closer to 流氓怪 than 硫方怪 is. Only meaning can prefer 硫方怪.
    const hexagram: PhoneticVocabularyEntry = { ...sulfurCube, term: 'Hexagram Mob', writtenForms: ['六芒怪'], pronunciations: [['l', 'iù', 'm', 'áng', 'g', 'uài']], description: 'A mob from another game.' }
    const rerank = vi.fn<NonNullable<VoicePhoneticMatchOptions['rerank']>>(async ({ candidates }) => candidates.filter(item => item.candidate === '硫方怪'))
    const { controller, submit, speak } = createHarness([sulfurCube, hexagram], rerank)

    await speak('我遇到了一只流氓怪')

    expect(rerank.mock.calls[0][0].candidates[0].candidate).toBe('六芒怪')
    expect(rerank.mock.calls[0][0].sessionId).toBe('alice')
    expect(submit.mock.calls[0][0].context[0].value).toEqual(expect.objectContaining({ items: [expect.objectContaining({ span: '流氓怪', candidate: '硫方怪' })] }))
    await controller.close()
  })

  it('publishes nothing when no phrase sounds like a term', async () => {
    const { controller, submit, speak } = createHarness([sulfurCube])

    await speak('今天天气很好')

    expect(submit.mock.calls[0][0].context).toEqual([])
    await controller.close()
  })

  it('installs no work without a vocabulary', async () => {
    const { controller, submit, speak } = createHarness([])

    await speak('我遇到了一只流氓怪')

    expect(submit.mock.calls[0][0].context).toEqual([])
    await controller.close()
  })
})
