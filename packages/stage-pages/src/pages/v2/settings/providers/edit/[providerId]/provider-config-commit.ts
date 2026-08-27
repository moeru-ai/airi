export interface ProviderConfigEditCommit {
  config: Record<string, unknown>
  providerId: string
  status: 'configured' | 'bypassed'
}

export interface ProviderConfigEditCommitDependencies {
  disposeProviderInstance: (providerId: string) => Promise<unknown>
  setTranscriptionModelForProvider: (providerId: string, model: string) => Promise<unknown>
  updateProviderConfig: (
    providerId: string,
    config: Record<string, unknown>,
    status: 'configured' | 'bypassed',
  ) => Promise<unknown>
}

/**
 * Saves a provider config and its transcription model under one captured provider ID.
 */
export async function commitProviderConfigEdit(
  commit: ProviderConfigEditCommit,
  dependencies: ProviderConfigEditCommitDependencies,
) {
  await dependencies.disposeProviderInstance(commit.providerId)
  await dependencies.updateProviderConfig(commit.providerId, commit.config, commit.status)
  if (typeof commit.config.model === 'string') {
    await dependencies.setTranscriptionModelForProvider(commit.providerId, commit.config.model)
  }
}
