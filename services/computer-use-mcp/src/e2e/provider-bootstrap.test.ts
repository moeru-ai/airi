import { describe, expect, it } from 'vitest'

import { getProviderBootstrapConfig, resolveGithubModelsApiKey } from './provider-bootstrap'

describe('provider bootstrap', () => {
  it('prefers explicit github models env keys before legacy aliases', () => {
    expect(resolveGithubModelsApiKey({
      dotenvValues: {},
      processEnv: {
        GITHUB_MODELS_API_KEY: 'ghp-preferred',
        GITHUB_TOKEN: 'ghp-fallback',
      },
    })).toBe('ghp-preferred')
  })

  it('falls back to legacy GitHub_token from .env for this repo', () => {
    expect(resolveGithubModelsApiKey({
      dotenvValues: {
        GitHub_token: 'ghp-legacy',
      },
      processEnv: {},
    })).toBe('ghp-legacy')
  })

  it('builds github-models bootstrap config with the default inference base url', () => {
    expect(getProviderBootstrapConfig({
      dotenvValues: {
        GitHub_token: 'ghp-legacy',
      },
      processEnv: {},
      providerId: 'github-models',
    })).toEqual({
      apiKey: 'ghp-legacy',
      baseUrl: 'https://models.github.ai/inference',
    })
  })

  it('does not fabricate bootstrap config for unrelated providers', () => {
    expect(getProviderBootstrapConfig({
      dotenvValues: {},
      processEnv: {
        GITHUB_MODELS_API_KEY: 'ghp-test',
      },
      providerId: 'openrouter',
    })).toBeUndefined()
  })
})
