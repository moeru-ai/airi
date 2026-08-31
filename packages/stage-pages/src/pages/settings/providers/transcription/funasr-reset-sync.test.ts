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
    // ROOT CAUSE:
    //
    // Replacing an entry on the derived configs projection does not update the provider record,
    // and awaiting persistence before the model write exposes mismatched state. The reset must
    // queue a short atomic stage before separately awaiting guarded persistence.
    expect(source).toContain('await modelUpdateQueue.enqueue(async () =>')
    expect(source).toContain('await hearingStore.stageTranscriptionProviderConfig(')
    expect(source).toContain('await providerConfigStore.persistProviderConfigIfCurrent(')
    expect(source).toContain(':on-reset="handleResetFunASRSettings"')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888703149
  it('keeps an unchanged default FunASR reset ready (GitHub #2122)', () => {
    const resetHandler = source.slice(
      source.indexOf('async function handleResetFunASRSettings()'),
      source.indexOf('\nonMounted('),
    )

    // ROOT CAUSE:
    //
    // A reset stored an identical default config with an unconfigured status. The serialized
    // config watcher did not run because the config content did not change. The provider then
    // stayed blocked until the user changed a field or reloaded the page.
    expect(resetHandler).toContain('{ ...defaultOptions }, \'configured\', commitId)')
    expect(resetHandler).not.toContain('{ ...defaultOptions }, \'unconfigured\', commitId)')
  })
})
