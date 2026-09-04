import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../../../../stage-pages/src/pages/settings/modules/hearing.vue', import.meta.url)), 'utf8')

describe('hearing model selection', () => {
  it('allows a bypassed FunASR provider with an empty catalog to accept a manual model', () => {
    expect(source).toContain('const allowsManualModelInput = computed(() =>')
    expect(source).toContain('providerId === \'funasr-audio-transcription\'')
    expect(source).toContain('providerStore.providers[providerId]?.status === \'bypassed\'')
    expect(source).toContain('v-else-if="allowsManualModelInput"')
  })
})
