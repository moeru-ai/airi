import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getProviderCategory } from '../metadata'
import { listProviders } from './registry'

import './index'

/**
 * `PAGELESS_TRANSCRIPTION_PROVIDERS` lists the transcription providers that the
 * catalog shows without a settings page. Each entry states why it is not needed.
 */
const PAGELESS_TRANSCRIPTION_PROVIDERS = new Set([
  // Both providers declare `views.hearing`, so the Hearing module renders their
  // settings inline instead of routing to a provider page.
  'apple-speech-transcription',
  'sherpaw-transcription',
])

// NOTICE:
// This test reads the page files of the stage-pages package. The stage-pages
// test project runs in browser mode only, so a node test cannot live there.
// Source: packages/stage-pages/vitest.config.ts
// Removal condition: stage-pages gains a node test project.
const transcriptionPagesDirectory = resolve(
  import.meta.dirname,
  '../../../../../stage-pages/src/pages/settings/providers/transcription',
)

describe('transcription provider settings pages', () => {
  // ROOT CAUSE:
  //
  // The transcription directory has no `[providerId].vue` catch-all, so a
  // transcription provider without a page reaches the global catch-all route
  // and the catalog link dead-ends.
  //
  // The new MiniMax provider needs a page. This test keeps the next
  // transcription provider from shipping without one.
  it('has a settings page for every listed transcription provider', () => {
    const missing = listProviders()
      .filter(definition => getProviderCategory(definition.tasks) === 'transcription')
      .filter(definition => !PAGELESS_TRANSCRIPTION_PROVIDERS.has(definition.id))
      .filter(definition => !existsSync(resolve(transcriptionPagesDirectory, `${definition.id}.vue`)))
      .map(definition => definition.id)

    expect(missing).toEqual([])
  })
})
