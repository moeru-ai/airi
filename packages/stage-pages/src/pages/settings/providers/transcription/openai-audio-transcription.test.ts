import { describe, expect, it, vi } from 'vitest'

import { createOpenAIAudioTranscriptionController } from './openai-audio-transcription'

describe('openAI audio transcription page', () => {
  it('waits for the selected model to persist before starting the playground request (GitHub #2122)', async () => {
    let releaseModelWrite!: () => void
    let persistedModel = 'whisper-1'
    const modelWrite = new Promise<void>((resolve) => {
      releaseModelWrite = () => {
        persistedModel = 'gpt-4o-transcribe'
        resolve()
      }
    })
    const transcribe = vi.fn(async (_model: string) => 'transcript')
    const controller = createOpenAIAudioTranscriptionController({
      getProvider: async () => ({}),
      getProviderConfig: () => ({ model: persistedModel }),
      reportModelSaveError: vi.fn(),
      saveModel: () => modelWrite,
      transcribe: async (_provider, model) => transcribe(model),
    })

    // Vue does not await the FieldCombobox event handler. Before the fix, the
    // playground callback could read whisper-1 while this write was pending.
    const updateTask = controller.updateModel('gpt-4o-transcribe')
    const requestTask = controller.generateTranscription({} as File)
    await Promise.resolve()

    expect(transcribe).not.toHaveBeenCalled()

    releaseModelWrite()
    await expect(updateTask).resolves.toBeUndefined()
    await expect(requestTask).resolves.toBe('transcript')
    expect(transcribe).toHaveBeenCalledWith('gpt-4o-transcribe')
  })
})
