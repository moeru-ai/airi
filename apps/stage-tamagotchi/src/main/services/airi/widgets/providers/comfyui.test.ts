import { minutesToMilliseconds, secondsToMilliseconds } from 'date-fns'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ComfyUIProvider } from './comfyui'

describe('comfyui provider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits beyond the former five-minute limit when a longer timeout is configured', async () => {
    // ROOT CAUSE:
    // ComfyUI keeps remote jobs running after local polling stops.
    // A longer configured deadline must keep polling until the image is ready.
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
      comfyuiServerUrl: 'https://comfyui.example.com',
      comfyuiGenerationTimeoutMinutes: 10,
      comfyuiSavedWorkflows: [{
        id: 'slow-workflow',
        name: 'Slow fixture',
        workflow: {},
        exposedFields: {},
      }],
      comfyuiActiveWorkflow: 'slow-workflow',
    })

    const job = await provider.generate({ prompt: 'A slow image', extra: {} })
    await vi.advanceTimersByTimeAsync(minutesToMilliseconds(5) + secondsToMilliseconds(10))

    await expect(provider.getStatus(job.jobId)).resolves.toMatchObject({
      status: 'succeeded',
      imageUrl: 'https://comfyui.example.com/view?filename=result.png&subfolder=&type=output',
    })
  })

  // https://github.com/moeru-ai/airi/pull/2083 (Codex review: snapshot the generation timeout per ComfyUI job)
  it('keeps a running job\'s original timeout when the provider is re-initialized mid-flight (PR #2083 review)', async () => {
    // ROOT CAUSE:
    // Re-initializing the singleton changed deadlines for running jobs.
    // Each job must retain the timeout captured when generation starts.
    vi.useFakeTimers()

    let historyRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/prompt')) {
        return new Response(JSON.stringify({ prompt_id: 'slow-job' }), { status: 200 })
      }

      historyRequests++
      // Complete after six minutes of polling at five-second intervals.
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
      comfyuiServerUrl: 'https://comfyui.example.com',
      comfyuiGenerationTimeoutMinutes: 10,
      comfyuiSavedWorkflows: [{
        id: 'slow-workflow',
        name: 'Slow fixture',
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
    await vi.advanceTimersByTimeAsync(minutesToMilliseconds(6) + secondsToMilliseconds(5))

    await expect(provider.getStatus(job.jobId)).resolves.toMatchObject({
      status: 'succeeded',
      imageUrl: 'https://comfyui.example.com/view?filename=result.png&subfolder=&type=output',
    })
  })
})
