import { describe, expect, it } from 'vitest'

import { getProviderBootstrapConfig, resolveGithubModelsApiKey } from './provider-bootstrap'

describe('provider bootstrap', () => {
  it('prefers explicit github models env keys before legacy aliases', () => {
    expect(resolveGithubModelsApiKey({
      processEnv: {
        GITHUB_TOKEN: 'ghp-fallback',
        GITHUB_MODELS_API_KEY: 'ghp-preferred',
      },
      dotenvValues: {},
    })).toBe('ghp-preferred')
  })

  it('falls back to legacy GitHub_token from .env for this repo', () => {
    expect(resolveGithubModelsApiKey({
      processEnv: {},
      dotenvValues: {
        GitHub_token: 'ghp-legacy',
      },
    })).toBe('ghp-legacy')
  })

  it('builds github-models bootstrap config with the default inference base url', () => {
    expect(getProviderBootstrapConfig({
      providerId: 'github-models',
      processEnv: {},
      dotenvValues: {
        GitHub_token: 'ghp-legacy',
      },
    })).toEqual({
      apiKey: 'ghp-legacy',
      baseUrl: 'https://models.github.ai/inference',
    })
  })

  it('does not fabricate bootstrap config for unrelated providers', () => {
    expect(getProviderBootstrapConfig({
      providerId: 'openrouter',
      processEnv: {
        GITHUB_MODELS_API_KEY: 'ghp-test',
      },
      dotenvValues: {},
    })).toBeUndefined()
  })
})
