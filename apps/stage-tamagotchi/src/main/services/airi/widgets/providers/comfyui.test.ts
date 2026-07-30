import { afterEach, describe, expect, it, vi } from 'vitest'

import { ComfyUIProvider } from './comfyui'

describe('comfyui provider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits beyond the former five-minute limit when a longer timeout is configured', async () => {
    // ROOT CAUSE:
    //
    // ComfyUI jobs continue on the remote host after AIRI's polling loop stops.
    // A workflow that needs more than five minutes therefore produced a failed
    // tool result even though ComfyUI eventually saved the requested image.
    //
    // The timeout is now persisted as a user setting and passed to the provider.
    vi.useFakeTimers()

    let historyRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/prompt')) {
        return new Response(JSON.stringify({ prompt_id: 'slow-job' }), { status: 200 })
      }

      historyRequests++
      if (historyRequests < 62)
        return new Response(JSON.stringify({}), { status: 200 })

      return new Response(JSON.stringify({
        'slow-job': {
          outputs: {
            result: {
              images: [{ filename: 'result.png', subfolder: '', type: 'output' }],
            },
          },
          status: { completed: true },
        },
      }), { status: 200 })
    }))

    const provider = new ComfyUIProvider()
    await provider.initialize({
      comfyuiServerUrl: 'http://comfyui.test:8188',
      comfyuiGenerationTimeoutMinutes: 10,
      comfyuiSavedWorkflows: [{
        id: 'slow-workflow',
        workflow: {},
        exposedFields: {},
      }],
      comfyuiActiveWorkflow: 'slow-workflow',
    })

    const job = await provider.generate({ prompt: 'A slow image', extra: {} })
    await vi.advanceTimersByTimeAsync(310_000)

    await expect(provider.getStatus(job.jobId)).resolves.toMatchObject({
      status: 'succeeded',
      imageUrl: 'http://comfyui.test:8188/view?filename=result.png&subfolder=&type=output',
    })
  })

  // https://github.com/moeru-ai/airi/pull/2083 (Codex review: snapshot the generation timeout per ComfyUI job)
  it('keeps a running job\'s original timeout when the provider is re-initialized mid-flight (PR #2083 review)', async () => {
    // ROOT CAUSE:
    //
    // The provider is registered as a singleton and pollForResult read the mutable
    // this.generationTimeoutMs on every poll pass. Re-initializing the provider while
    // a slow job was still polling (e.g. a second headless generation syncing a
    // shorter timeout) moved the first job's deadline, so a 10-minute job failed
    // ~5 minutes after the second initialize().
    //
    // We fixed this by snapshotting the timeout in generate() and passing that
    // snapshot into pollForResult instead of reading the mutable field.
    vi.useFakeTimers()

    let historyRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/prompt')) {
        return new Response(JSON.stringify({ prompt_id: 'slow-job' }), { status: 200 })
      }

      historyRequests++
      // Complete after ~6 minutes of polling (5s interval -> 72 polls)
      if (historyRequests < 72)
        return new Response(JSON.stringify({}), { status: 200 })

      return new Response(JSON.stringify({
        'slow-job': {
          outputs: {
            result: {
              images: [{ filename: 'result.png', subfolder: '', type: 'output' }],
            },
          },
          status: { completed: true },
        },
      }), { status: 200 })
    }))

    const provider = new ComfyUIProvider()
    await provider.initialize({
      comfyuiServerUrl: 'http://comfyui.test:8188',
      comfyuiGenerationTimeoutMinutes: 10,
      comfyuiSavedWorkflows: [{
        id: 'slow-workflow',
        workflow: {},
        exposedFields: {},
      }],
      comfyuiActiveWorkflow: 'slow-workflow',
    })

    const job = await provider.generate({ prompt: 'A slow image', extra: {} })

    // A second job syncing different settings re-initializes the singleton provider.
    await provider.initialize({ comfyuiGenerationTimeoutMinutes: 5 })

    // Past the re-initialized 5-minute deadline but before the original 10-minute
    // one, and before the provider's 10s post-completion result cleanup runs.
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000 + 5_000)

    await expect(provider.getStatus(job.jobId)).resolves.toMatchObject({
      status: 'succeeded',
      imageUrl: 'http://comfyui.test:8188/view?filename=result.png&subfolder=&type=output',
    })
  })
})
