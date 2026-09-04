interface ProviderModelSelectionState {
  definitionId?: string
  status?: string
}

export function allowsManualModelInput({
  supportsModelListing,
  modelCount,
  isLoading,
  provider,
}: {
  supportsModelListing: boolean
  modelCount: number
  isLoading: boolean
  provider?: ProviderModelSelectionState
}) {
  if (!supportsModelListing)
    return true
  if (modelCount > 0 || isLoading)
    return false

  return provider?.definitionId === 'openai-compatible-audio-transcription'
    || (provider?.definitionId === 'funasr-audio-transcription' && provider.status === 'bypassed')
}
