import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeEach, expect, it, vi } from 'vitest'

import { setupSherpawModelAssetsProtocol } from './sherpaw-model-assets'

const { fetchFile, handleProtocol } = vi.hoisted(() => ({
  fetchFile: vi.fn(),
  handleProtocol: vi.fn(),
}))

vi.mock('electron', () => ({
  net: { fetch: fetchFile },
  protocol: { handle: handleProtocol },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

it('serves only model files with a fetchable response', async () => {
  fetchFile.mockResolvedValue(new Response('model data'))
  setupSherpawModelAssetsProtocol('/app/out/renderer')

  const handler = handleProtocol.mock.calls[0][1] as (request: Request) => Promise<Response>
  const response = await handler(new Request('airi-sherpaw://assets/preload-abc123.data'))

  expect(fetchFile).toHaveBeenCalledWith(
    pathToFileURL(join('/app/out/renderer', 'assets', 'preload-abc123.data')).href,
    { signal: expect.any(AbortSignal) },
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(await response.text()).toBe('model data')
})

it('rejects paths outside the model asset names', async () => {
  setupSherpawModelAssetsProtocol('/app/out/renderer')

  const handler = handleProtocol.mock.calls[0][1] as (request: Request) => Promise<Response>
  const response = await handler(new Request('airi-sherpaw://assets/../main/index.js'))

  expect(response.status).toBe(404)
  expect(fetchFile).not.toHaveBeenCalled()
})
