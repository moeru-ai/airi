import type { ArtistryJobStatus, ArtistryProvider } from './providers/base'

import { Buffer } from 'node:buffer'

import { differenceInMilliseconds, minutesToMilliseconds, secondsToMilliseconds } from 'date-fns'
import { injeca } from 'injeca'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { artistryProviders, generateHeadless } from './artistry-bridge'
import { ComfyUIProvider } from './providers/comfyui'

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

async function withCallbackProvider<T>(
  providerId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const originalProvider = artistryProviders.get(providerId)
  artistryProviders.set(providerId, createNeverSettlingCallbackProvider() as ArtistryProvider)

  try {
    return await callback()
  }
  finally {
    if (originalProvider)
      artistryProviders.set(providerId, originalProvider)
  }
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
    vi.unstubAllGlobals()
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
    // own timeout error surfaces first). The shared schema supplies the ten-minute default.
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
      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(1))
      expect(settled).toBe(false)

      // The configured 10-minute timeout (plus the grace margin) is what ends the wait.
      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(105))
      const result = await pending
      expect(result.error).toBe('Image generation timed out after 10 minutes.')
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })

  // https://github.com/moeru-ai/airi/pull/2083
  // ROOT CAUSE:
  // The provider starts its generation clock after upload and queue requests.
  // A thirty-second headless margin expires before both requests can finish.
  it('waits for upload and queue before the full ComfyUI generation window (PR #2083)', async () => {
    vi.useFakeTimers()
    const originalProvider = artistryProviders.get('comfyui')
    artistryProviders.set('comfyui', new ComfyUIProvider())
    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
    let pollingStartedAt = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/upload/image') {
        await new Promise(resolve => setTimeout(resolve, secondsToMilliseconds(59)))
        return Response.json({ name: 'fixture.png' })
      }
      if (url.pathname === '/prompt') {
        await new Promise(resolve => setTimeout(resolve, secondsToMilliseconds(14)))
        pollingStartedAt = Date.now()
        return Response.json({ prompt_id: 'fixture-prompt' })
      }
      if (url.pathname === '/history/fixture-prompt') {
        if (differenceInMilliseconds(Date.now(), pollingStartedAt) < minutesToMilliseconds(5))
          return Response.json({})
        return Response.json({ 'fixture-prompt': { outputs: { image: { images: [{ filename: 'fixture.png' }] } } } })
      }
      if (url.pathname === '/view')
        return new Response(new Uint8Array(Buffer.from(imageBase64, 'base64')), { headers: { 'Content-Type': 'image/png' } })
      throw new Error(`Unexpected fixture request: ${url.pathname}`)
    }))

    try {
      let result: Awaited<ReturnType<typeof generateHeadless>> | undefined
      const pending = generateHeadless({
        prompt: 'A fixture image',
        provider: 'comfyui',
        globals: {
          comfyuiServerUrl: 'https://comfyui.example.com',
          comfyuiGenerationTimeoutMinutes: 5,
          comfyuiActiveWorkflow: 'fixture-workflow',
          comfyuiSavedWorkflows: [{ id: 'fixture-workflow', name: 'Fixture', workflow: { image: { class_type: 'LoadImage', inputs: { image: '{{IMAGE}}' } } }, exposedFields: {} }],
          image: `data:image/png;base64,${imageBase64}`,
        },
      }).then((value) => {
        result = value
        return value
      })
      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(72))
      expect(result).toBeUndefined()
      await vi.advanceTimersByTimeAsync(secondsToMilliseconds(2))
      await expect(pending).resolves.toEqual({
        imageUrl: 'https://comfyui.example.com/view?filename=fixture.png&subfolder=&type=output',
        base64: `data:image/png;base64,${imageBase64}`,
      })
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })

  // https://github.com/moeru-ai/airi/pull/2083
  // ROOT CAUSE:
  // Concurrent headless requests await one shared provider's initialization.
  // The later initialization can replace the earlier request's generation timeout before generate resumes.
  it('pins concurrent headless timeouts before shared provider initialization (PR #2083)', async () => {
    vi.useFakeTimers()
    const originalProvider = artistryProviders.get('comfyui')
    artistryProviders.set('comfyui', new ComfyUIProvider())
    let promptCount = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/prompt')
        return Response.json({ prompt_id: `fixture-prompt-${++promptCount}` })
      if (url.pathname.startsWith('/history/'))
        return Response.json({})
      throw new Error(`Unexpected fixture request: ${url.pathname}`)
    }))
    const globals = {
      comfyuiServerUrl: 'https://comfyui.example.com',
      comfyuiActiveWorkflow: 'fixture-workflow',
      comfyuiSavedWorkflows: [{ id: 'fixture-workflow', name: 'Fixture', workflow: {}, exposedFields: {} }],
    }

    try {
      let firstResult: Awaited<ReturnType<typeof generateHeadless>> | undefined
      let secondResult: Awaited<ReturnType<typeof generateHeadless>> | undefined
      const first = generateHeadless({ prompt: 'First fixture', provider: 'comfyui', globals: { ...globals, comfyuiGenerationTimeoutMinutes: 5 } }).then((value) => {
        firstResult = value
        return value
      })
      const second = generateHeadless({ prompt: 'Second fixture', provider: 'comfyui', globals: { ...globals, comfyuiGenerationTimeoutMinutes: 10 } }).then((value) => {
        secondResult = value
        return value
      })

      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(6))
      expect(promptCount).toBe(2)
      expect(firstResult).toEqual({ error: 'Generation timed out after 5 minutes' })
      expect(secondResult).toBeUndefined()
      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(6))
      await expect(first).resolves.toEqual({ error: 'Generation timed out after 5 minutes' })
      await expect(second).resolves.toEqual({ error: 'Generation timed out after 10 minutes' })
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })

  it('uses the shared ten-minute default when ComfyUI timeout is unset', async () => {
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

      await vi.advanceTimersByTimeAsync(minutesToMilliseconds(10) + secondsToMilliseconds(106))
      const result = await pending
      expect(result.error).toBe('Image generation timed out after 10 minutes.')
    }
    finally {
      if (originalProvider)
        artistryProviders.set('comfyui', originalProvider)
    }
  })

  // https://github.com/moeru-ai/airi/pull/2083 (Codex review: scope ComfyUI timeout to ComfyUI headless runs)
  it('keeps the default safety timeout for non-ComfyUI providers (Issue #2084)', async () => {
    // ROOT CAUSE:
    //
    // The shared globals object includes comfyuiGenerationTimeoutMinutes even when
    // another provider is active. Using that value unconditionally let a ComfyUI
    // slider selection extend a stalled cloud provider's headless wait.
    //
    // We fixed this by applying the configured timeout only to ComfyUI. Other
    // providers keep the existing five-minute safety-net timeout.
    vi.useFakeTimers()

    const pending = withCallbackProvider('nanobanana', () => generateHeadless({
      prompt: 'a stalled cloud image',
      provider: 'nanobanana',
      globals: { comfyuiGenerationTimeoutMinutes: 10 },
    }))

    await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + 1)

    await expect(pending).resolves.toEqual({
      error: 'Image generation timed out after 5 minutes.',
    })
  })
})
