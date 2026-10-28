import type { TranscriptionProvider } from '@xsai-ext/providers/utils'

type TranscriptionProviderWithOptions<TProvider extends TranscriptionProvider> = Omit<TProvider, 'transcription'> & {
  transcription: (
    model: Parameters<TProvider['transcription']>[0],
    extraOptions?: Record<string, unknown>,
  ) => ReturnType<TranscriptionProvider['transcription']>
}

/** Mutates the provider so caller options override defaults in each transcription request. */
export function withTranscriptionOptions<TProvider extends TranscriptionProvider>(provider: TProvider): TranscriptionProviderWithOptions<TProvider> {
  const transcription = provider.transcription.bind(provider)
  return Object.assign(provider, {
    transcription: (model: Parameters<TProvider['transcription']>[0], extraOptions?: Record<string, unknown>) => ({
      ...transcription(model),
      ...extraOptions,
    }),
  })
}
