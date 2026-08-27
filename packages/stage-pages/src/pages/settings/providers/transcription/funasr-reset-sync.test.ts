import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./funasr-audio-transcription.vue', import.meta.url)),
  'utf8',
)

describe('funASR transcription settings reset', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3873768189
  it('routes provider reset through the synchronized Hearing model action (GitHub #2122)', () => {
    expect(source).toContain('async function handleResetFunASRSettings()')
    expect(source).toContain('resetProviderSettings()')
    expect(source).toContain('await modelUpdateQueue.update(model.value)')
    expect(source).toContain(':on-reset="handleResetFunASRSettings"')
  })
})
