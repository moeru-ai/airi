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
}

/**
 * Saves a provider config and its transcription model under one captured provider ID.
 */
export async function commitProviderConfigEdit(
  commit: ProviderConfigEditCommit,
  dependencies: ProviderConfigEditCommitDependencies,
) {
  const commitId = crypto.randomUUID()
  await dependencies.disposeProviderInstance(commit.providerId)
  await dependencies.stageTranscriptionProviderConfig(commit.providerId, commit.config, commit.status, commitId)
  await dependencies.persistProviderConfigIfCurrent(commit.providerId, commit.config, commit.status, commitId)
}
