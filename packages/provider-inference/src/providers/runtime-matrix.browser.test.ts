import type { ProviderTranslator } from '../types'

import { describe, expect, it } from 'vitest'

import { portableProviderDefinitions } from '.'

const translate: ProviderTranslator = key => key
const browserOnlyProviderIds = new Set(['browser-web-speech-api'])
const localApiProviderIds = new Set([
  'aivis-speech',
  'index-tts-vllm',
  'lm-studio',
  'ollama',
  'player2-speech',
  'voicevox',
])
const localRunProviderIds = new Set([
  'browser-web-speech-api',
  'speech-noop',
])

function testCategory(providerId: string): 'cloud-api' | 'local-api' | 'local-run' {
  if (localApiProviderIds.has(providerId))
    return 'local-api'
  if (localRunProviderIds.has(providerId))
    return 'local-run'
  return 'cloud-api'
}

function testRuntimeResult(providerId: string): 'browser-only' | 'node-and-browser' {
  return browserOnlyProviderIds.has(providerId) ? 'browser-only' : 'node-and-browser'
}

describe('portable provider runtime matrix in Browser', () => {
  for (const definition of portableProviderDefinitions) {
    const category = testCategory(definition.id)
    const result = testRuntimeResult(definition.id)

    it(`[${category}/${result}] loads ${definition.id}`, async () => {
      const schema = await definition.createProviderConfig({ t: translate })

      expect(schema).toBeDefined()
    })
  }
})
