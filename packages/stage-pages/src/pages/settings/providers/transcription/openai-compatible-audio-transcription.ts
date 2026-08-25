import { createTranscriptionModelUpdateQueue } from '@proj-airi/stage-ui/libs/providers'

const providerId = 'openai-compatible-audio-transcription'

const validTranscriptionModels = [
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini-transcribe-2025-12-15',
  'gpt-4o-transcribe-diarize',
]

interface OpenAICompatibleAudioTranscriptionControllerDependencies<Provider, Result> {
  getProvider: () => Promise<Provider | undefined>
  getProviderConfig: () => Record<string, unknown> | undefined
  readReactiveModel: () => string
  reportModelSaveError: (cause: unknown) => void
  saveModel: (model: string) => Promise<void>
  transcribe: (provider: Provider, model: string, file: File) => Promise<Result>
}

export function isValidOpenAICompatibleTranscriptionModel(model: string | undefined | null): boolean {
  if (!model)
    return false
  if (validTranscriptionModels.includes(model))
    return true
  if (model.includes('gpt-4') && !model.includes('transcribe') && !model.includes('whisper'))
    return false
  return true
}

export function createOpenAICompatibleAudioTranscriptionController<Provider, Result>(
  dependencies: OpenAICompatibleAudioTranscriptionControllerDependencies<Provider, Result>,
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

      const providerConfig = dependencies.getProviderConfig()
      const model = providerConfig?.model as string | undefined || dependencies.readReactiveModel()
      if (!isValidOpenAICompatibleTranscriptionModel(model))
        throw new Error('Invalid or missing transcription model. Please configure a valid model in the provider settings.')

      return await dependencies.transcribe(provider, model, file)
    }),
    updateModel: (model: string | undefined) => modelUpdateQueue.update(model ?? ''),
  }
}

export { providerId as OPENAI_COMPATIBLE_AUDIO_TRANSCRIPTION_PROVIDER_ID }
