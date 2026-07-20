import type { ArtistryJobStatus, ArtistryProvider } from './providers/base'

import { injeca } from 'injeca'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { artistryProviders, generateHeadless } from './artistry-bridge'

/**
 * A callback-capable provider double whose job never settles on its own, so the
 * only thing that can end a headless run is the bridge's own wait timeout.
 */
function createNeverSettlingCallbackProvider() {
  const provider = {
    id: 'comfyui',
    name: 'ComfyUI (test double)',
    jobCallback: undefined as ((status: ArtistryJobStatus) => void) | undefined,
    initialize: vi.fn(async () => {}),
    generate: vi.fn(async () => ({ jobId: 'job-1', providerJobId: 'job-1' })),
    getStatus: vi.fn(async (): Promise<ArtistryJobStatus> => ({ status: 'running' })),
    setJobCallback: vi.fn((_jobId: string, callback: (status: ArtistryJobStatus) => void) => {
      provider.jobCallback = callback
    }),
  }
  return provider
}

describe('generateHeadless', () => {
  beforeEach(() => {
    // generateHeadless always resolves the persisted artistry config through injeca,
    // even when the caller passes explicit globals.
    injeca.provide('configs:artistry', () => ({
      get: () => ({ artistryProvider: 'comfyui', artistryGlobals: {} }),
      update: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // https://github.com/moeru-ai/airi/pull/2083 (Codex review: honor the timeout for headless ComfyUI runs)
  it('keeps waiting past five minutes when a longer ComfyUI timeout is configured (Issue #2084)', async () => {
    // ROOT CAUSE:
    //
    // generateHeadless wrapped callback-based providers in a hardcoded 5-minute timer,
    // so image_journal and autonomous generations failed with "Image generation timed
    // out after 5 minutes." even when comfyuiGenerationTimeoutMinutes was set higher —
    // the ComfyUI provider itself kept polling until the configured timeout, but the
    // headless caller had already rejected.
    //
    // We fixed this by deriving the headless wait timeout from
    // globals.comfyuiGenerationTimeoutMinutes (plus a grace margin so the provider's
    // own timeout error surfaces first), falling back to 5 minutes when unset.
    vi.useFakeTimers()

    const provider = createNeverSettlingCallbackProvider()
    const originalProvider = artistryProviders.get('comfyui')
    artistryProviders.set('comfyui', provider as ArtistryProvider)

    try {
      const pending = generateHeadless({
        prompt: 'a very slow image',
        provider: 'comfyui',
        globals: { comfyuiGenerationTimeoutMinutes: 10 },
      })

      let settled = false
      void pending.then(() => {
        settled = true
      })

      // Before the fix, the headless wait had already rejected at this point with
      // "Image generation timed out after 5 minutes."
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000)
      expect(settled).toBe(false)

      // The configured 10-minute timeout (plus the grace margin) is what ends the wait.
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000)
      const result = await pending
      expect(result.error).toBe('Image generation timed out after 10 minutes.')
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })

  it('still times out after five minutes when no timeout is configured', async () => {
    vi.useFakeTimers()

    const provider = createNeverSettlingCallbackProvider()
    const originalProvider = artistryProviders.get('comfyui')
    artistryProviders.set('comfyui', provider as ArtistryProvider)

    try {
      const pending = generateHeadless({
        prompt: 'an image with default timeout',
        provider: 'comfyui',
        globals: {},
      })

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000 + 1000)
      const result = await pending
      expect(result.error).toBe('Image generation timed out after 5 minutes.')
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })
})
