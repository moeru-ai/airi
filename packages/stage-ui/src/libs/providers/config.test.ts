import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { toProviderConfigSnapshot } from './config'

describe('provider configuration snapshots', () => {
  // https://github.com/moeru-ai/airi/issues/2523
  // ROOT CAUSE:
  //
  // Provider settings passed a Vue reactive proxy to a synchronized Pinia
  // action. The synchronization plugin sends action arguments through a
  // BroadcastChannel, whose structured clone algorithm rejects Vue proxies.
  //
  // A shallow copy does not remove proxies from nested configuration values.
  // The snapshot must make the complete configuration graph plain.
  it('creates structured-cloneable action arguments from reactive configuration', () => {
    const config = reactive({
      apiKey: 'test-key',
      voiceSettings: { similarityBoost: 0.75 },
    })

    const snapshot = toProviderConfigSnapshot(config)

    expect(() => structuredClone(['elevenlabs', snapshot])).not.toThrow()
    expect(snapshot).toEqual({
      apiKey: 'test-key',
      voiceSettings: { similarityBoost: 0.75 },
    })
  })
})
