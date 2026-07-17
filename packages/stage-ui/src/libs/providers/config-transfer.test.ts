import { describe, expect, it } from 'vitest'

import { detectTransferFormat, parseProviderConfigs, serializeProviderConfigs } from './config-transfer'

const SAMPLE_CONFIGS = {
  'openai': {
    apiKey: 'sk-test-key',
    baseUrl: 'https://api.openai.com/v1/',
  },
  'fish-audio': {
    apiKey: 'fa-key',
    baseUrl: 'https://unspeech.hyp3r.link/v1/',
    model: 's1',
  },
  'elevenlabs': {
    apiKey: 'el-key',
    voiceSettings: { similarityBoost: 0.75, stability: 0.5 },
  },
}

describe('serializeProviderConfigs / parseProviderConfigs round-trips', () => {
  it('round-trips through JSON with the versioned envelope', () => {
    const serialized = serializeProviderConfigs(SAMPLE_CONFIGS, 'json')

    expect(JSON.parse(serialized).version).toBe(1)
    expect(parseProviderConfigs(serialized, 'json')).toEqual(SAMPLE_CONFIGS)
  })

  it('round-trips through YAML with the versioned envelope', () => {
    const serialized = serializeProviderConfigs(SAMPLE_CONFIGS, 'yaml')

    expect(serialized).toContain('version: 1')
    expect(parseProviderConfigs(serialized, 'yaml')).toEqual(SAMPLE_CONFIGS)
  })

  it('round-trips through .env including nested objects', () => {
    const serialized = serializeProviderConfigs(SAMPLE_CONFIGS, 'env')

    expect(serialized).toContain('AIRI_PROVIDER__OPENAI__API_KEY=sk-test-key')
    expect(serialized).toContain('AIRI_PROVIDER__FISH_AUDIO__BASE_URL=https://unspeech.hyp3r.link/v1/')
    expect(parseProviderConfigs(serialized, 'env')).toEqual(SAMPLE_CONFIGS)
  })

  it('preserves numeric-looking string secrets through .env', () => {
    const configs = { openai: { apiKey: '12345' } }
    const serialized = serializeProviderConfigs(configs, 'env')

    expect(serialized).toContain('AIRI_PROVIDER__OPENAI__API_KEY="12345"')
    expect(parseProviderConfigs(serialized, 'env')).toEqual(configs)
  })

  it('preserves boolean and number values through .env', () => {
    const configs = { openai: { streaming: true, temperature: 0.7 } }
    const serialized = serializeProviderConfigs(configs, 'env')

    expect(parseProviderConfigs(serialized, 'env')).toEqual(configs)
  })
})

describe('parseProviderConfigs input handling', () => {
  it('accepts a bare provider record without the envelope', () => {
    const bare = JSON.stringify({ openai: { apiKey: 'sk-1' } })
    expect(parseProviderConfigs(bare, 'json')).toEqual({ openai: { apiKey: 'sk-1' } })
  })

  it('accepts hand-written minimal YAML', () => {
    const yaml = 'fish-audio:\n  apiKey: fa-key\n'
    expect(parseProviderConfigs(yaml, 'yaml')).toEqual({ 'fish-audio': { apiKey: 'fa-key' } })
  })

  it('ignores comments and unrelated lines in .env content', () => {
    const env = [
      '# comment',
      'UNRELATED_VAR=1',
      'AIRI_PROVIDER__OPENAI__API_KEY=sk-1',
    ].join('\n')

    expect(parseProviderConfigs(env, 'env')).toEqual({ openai: { apiKey: 'sk-1' } })
  })

  it('rejects malformed JSON with a descriptive error', () => {
    expect(() => parseProviderConfigs('{oops', 'json')).toThrow(/Failed to parse JSON/)
  })

  it('rejects content that is not a provider record', () => {
    expect(() => parseProviderConfigs('"just a string"', 'json')).toThrow(/does not look like provider configurations/)
    expect(() => parseProviderConfigs(JSON.stringify({ openai: 'not-an-object' }), 'json')).toThrow(/does not look like provider configurations/)
  })

  it('rejects .env content without any provider entries', () => {
    expect(() => parseProviderConfigs('FOO=bar', 'env')).toThrow(/No AIRI_PROVIDER__/)
  })
})

describe('detectTransferFormat', () => {
  it('prefers the file extension when available', () => {
    expect(detectTransferFormat('providers.json', '')).toBe('json')
    expect(detectTransferFormat('providers.yaml', '')).toBe('yaml')
    expect(detectTransferFormat('providers.yml', '')).toBe('yaml')
    expect(detectTransferFormat('.env', '')).toBe('env')
    expect(detectTransferFormat('.env.local', '')).toBe('env')
  })

  it('sniffs pasted content when no file name is given', () => {
    expect(detectTransferFormat(undefined, '{"openai":{}}')).toBe('json')
    expect(detectTransferFormat(undefined, 'AIRI_PROVIDER__OPENAI__API_KEY=sk-1')).toBe('env')
    expect(detectTransferFormat(undefined, 'openai:\n  apiKey: sk-1')).toBe('yaml')
  })
})
