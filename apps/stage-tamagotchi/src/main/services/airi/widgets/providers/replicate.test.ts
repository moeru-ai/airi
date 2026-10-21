import type { ArtistryJobStatus } from './base'

import { afterEach, expect, it, vi } from 'vitest'

import { ReplicateProvider } from './replicate'

afterEach(() => vi.useRealTimers())

it.each([200, 401])('uses the SDK Fetch hook and preserves success or HTTP %s errors', async (status) => {
  vi.useFakeTimers()
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(
    status === 200 ? JSON.stringify({ id: 'prediction', status: 'succeeded', output: ['https://example.com/image.png'] }) : 'Invalid token',
    { status, headers: { 'content-type': 'application/json' } },
  ))
  const provider = new ReplicateProvider(fetch)
  await provider.initialize({ replicateApiKey: 'test' })
  const controller = new AbortController()
  const completed = new Promise<ArtistryJobStatus>((resolve) => {
    provider.setJobCallback('job', (result) => {
      if (result.status === 'succeeded' || result.status === 'failed')
        resolve(result)
    })
  })
  await provider.generate({ prompt: 'test', signal: controller.signal, extra: { internalJobId: 'job' } })
  const result = await completed
  expect(String(fetch.mock.calls[0][0])).toContain('/predictions')
  expect(fetch.mock.calls[0][1]?.method).toBe('POST')
  controller.abort()
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true)
  if (status === 200) {
    expect(result.imageUrl).toBe('https://example.com/image.png')
  }
  else {
    expect(result.status).toBe('failed')
    expect(result.error).toContain('401')
    expect(result.error).toContain('Invalid token')
  }
})
