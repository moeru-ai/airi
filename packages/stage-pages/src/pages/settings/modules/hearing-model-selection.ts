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
  if (isLoading)
    return false

  const isBypassedFunASR = provider?.definitionId === 'funasr-audio-transcription' && provider.status === 'bypassed'
  if (isBypassedFunASR)
    return true
  if (modelCount > 0)
    return false

  return provider?.definitionId === 'openai-compatible-audio-transcription'
}
