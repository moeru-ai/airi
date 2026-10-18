import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAI } from '../../../electron/ai-transport'
import { ReplicateClient } from './replicate-client'

vi.mock('../../../electron/ai-transport', () => ({ fetchAI: vi.fn() }))

afterEach(() => vi.resetAllMocks())

describe('replicate HTTP transport', () => {
  it.each([401, 429, 500])('submits generation once and retains HTTP %s', async (status) => {
    vi.mocked(fetchAI).mockResolvedValue(new Response('upstream failure', { status }))
    const client = new ReplicateClient({ auth: 'test', useFileOutput: false })
    const pending = client.request('/predictions', { method: 'POST', data: { input: { prompt: 'test' } } })
    await expect(pending).rejects.toMatchObject({ response: expect.objectContaining({ status }) })
    const error = await pending.catch((error: { response: Response }) => error)
    expect('response' in error && await error.response.text()).toBe('upstream failure')
    expect(fetchAI).toHaveBeenCalledTimes(1)
  })

  it('does not retry a network failure and passes cancellation to the request', async () => {
    vi.mocked(fetchAI).mockRejectedValue(new TypeError('network unavailable'))
    const client = new ReplicateClient({ auth: 'test', useFileOutput: false })
    const controller = new AbortController()
    await expect(client.request('/predictions', { method: 'POST', signal: controller.signal })).rejects.toThrow('network unavailable')
    expect(fetchAI).toHaveBeenCalledTimes(1)
    expect(fetchAI).toHaveBeenCalledWith(new URL('https://api.replicate.com/v1/predictions'), expect.objectContaining({ signal: controller.signal }))
  })
})
