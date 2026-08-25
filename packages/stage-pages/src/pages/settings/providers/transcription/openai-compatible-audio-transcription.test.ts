import { describe, expect, it, vi } from 'vitest'

import { createOpenAICompatibleAudioTranscriptionController } from './openai-compatible-audio-transcription'

describe('openAI-compatible audio transcription page', () => {
  it('waits for the selected model to persist before starting the playground request (GitHub #2122)', async () => {
    let releaseModelWrite!: () => void
    let persistedModel = 'whisper-1'
    const modelWrite = new Promise<void>((resolve) => {
      releaseModelWrite = () => {
        persistedModel = 'gpt-4o-mini-transcribe'
        resolve()
      }
    })
    const transcribe = vi.fn(async (_model: string) => 'transcript')
    const controller = createOpenAICompatibleAudioTranscriptionController({
      getProvider: async () => ({}),
      getProviderConfig: () => ({ model: persistedModel }),
      readReactiveModel: () => persistedModel,
      reportModelSaveError: vi.fn(),
      saveModel: () => modelWrite,
      transcribe: async (_provider, model) => transcribe(model),
    })

    // Vue does not await the FieldInput or FieldCombobox event handler. Before
    // the fix, this request could use the old model while the write was pending.
    const updateTask = controller.updateModel('gpt-4o-mini-transcribe')
    const requestTask = controller.generateTranscription({} as File)
    await Promise.resolve()

    expect(transcribe).not.toHaveBeenCalled()

    releaseModelWrite()
    await expect(updateTask).resolves.toBeUndefined()
    await expect(requestTask).resolves.toBe('transcript')
    expect(transcribe).toHaveBeenCalledWith('gpt-4o-mini-transcribe')
  })
})
