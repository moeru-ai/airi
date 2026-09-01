export interface ProviderConfigEditCommit {
  config: Record<string, unknown>
  providerId: string
  status: 'configured' | 'bypassed'
}

export interface ProviderConfigEditCommitDependencies {
  stageTranscriptionProviderConfig: (
    providerId: string,
    config: Record<string, unknown>,
    status: 'configured' | 'bypassed',
    commitId: string,
  ) => Promise<boolean | undefined>
  persistProviderConfigIfCurrent: (
    providerId: string,
    config: Record<string, unknown>,
    status: 'configured' | 'bypassed',
    commitId: string,
  ) => Promise<unknown>
  disposeProviderInstance: (providerId: string) => Promise<unknown>
  loadModelsForProvider: (providerId: string) => Promise<unknown>
}

/**
 * Saves a provider config and its transcription model under one captured provider ID.
 */
export async function commitProviderConfigEdit(
  commit: ProviderConfigEditCommit,
  dependencies: ProviderConfigEditCommitDependencies,
) {
  const commitId = crypto.randomUUID()
  await dependencies.stageTranscriptionProviderConfig(commit.providerId, commit.config, commit.status, commitId)
  try {
    await dependencies.disposeProviderInstance(commit.providerId)
  }
  catch (error) {
    console.error('Failed to dispose provider instance after saving provider config:', error)
  }
  void dependencies.loadModelsForProvider(commit.providerId).catch((error) => {
    console.error('Failed to refresh models after saving provider config:', error)
  })
  await dependencies.persistProviderConfigIfCurrent(commit.providerId, commit.config, commit.status, commitId)
}
