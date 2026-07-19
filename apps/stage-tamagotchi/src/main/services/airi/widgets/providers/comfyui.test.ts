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
})
