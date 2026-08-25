import { createTranscriptionModelUpdateQueue } from '@proj-airi/stage-ui/libs/providers'
import { resolveOpenAITranscriptionModel } from '@proj-airi/stage-ui/stores/modules/hearing'

const providerId = 'openai-audio-transcription'

interface OpenAIAudioTranscriptionControllerDependencies<Provider, Result> {
  getProvider: () => Promise<Provider | undefined>
  getProviderConfig: () => Record<string, unknown> | undefined
  reportModelSaveError: (cause: unknown) => void
  saveModel: (model: string) => Promise<void>
  transcribe: (provider: Provider, model: string, file: File) => Promise<Result>
}

export function createOpenAIAudioTranscriptionController<Provider, Result>(
  dependencies: OpenAIAudioTranscriptionControllerDependencies<Provider, Result>,
) {
  const modelUpdateQueue = createTranscriptionModelUpdateQueue(
    dependencies.saveModel,
    dependencies.reportModelSaveError,
  )

  return {
    generateTranscription: (file: File) => modelUpdateQueue.runAfterLatest(async () => {
      const provider = await dependencies.getProvider()
      if (!provider)
        throw new Error('Failed to initialize transcription provider')

      const model = resolveOpenAITranscriptionModel(dependencies.getProviderConfig())
      return await dependencies.transcribe(provider, model, file)
    }),
    updateModel: (model: string | undefined) => modelUpdateQueue.update(model ?? ''),
  }
}

export { providerId as OPENAI_AUDIO_TRANSCRIPTION_PROVIDER_ID }
