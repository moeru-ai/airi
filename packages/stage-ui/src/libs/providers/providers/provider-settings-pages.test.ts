import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getProviderCategory } from '../metadata'
import { listProviders } from './registry'

import './index'

/**
 * `PAGELESS_SPEECH_PROVIDERS` lists the speech providers that the catalog shows
 * without a settings page. Each entry states why the page is not needed.
 */
const PAGELESS_SPEECH_PROVIDERS = new Set([
  // This provider is the "None" engine. It takes no credentials. The Speech
  // module lists it as a selectable source.
  'speech-noop',
])

// NOTICE:
// This test reads the page files of the stage-pages package. The stage-pages
// test project runs in browser mode only, so a node test cannot live there.
// Source: packages/stage-pages/vitest.config.ts
// Removal condition: stage-pages gains a node test project.
const speechPagesDirectory = resolve(
  import.meta.dirname,
  '../../../../../stage-pages/src/pages/settings/providers/speech',
)

describe('speech provider settings pages', () => {
  // ROOT CAUSE:
  //
  // If a speech provider has no page file, the catalog link reaches the global
  // catch-all route. This happens because the speech directory has no
  // `[providerId].vue` catch-all.
  //
  // Before the patch, `minimax-speech` had no page file.
  //
  // We fixed this by adding the page file and sweeping every provider.
  it('has a settings page for every listed speech provider', () => {
    const missing = listProviders()
      .filter(definition => getProviderCategory(definition.tasks) === 'speech')
      .filter(definition => !PAGELESS_SPEECH_PROVIDERS.has(definition.id))
      .filter(definition => !existsSync(resolve(speechPagesDirectory, `${definition.id}.vue`)))
      .map(definition => definition.id)

    expect(missing).toEqual([])
  })
})

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
