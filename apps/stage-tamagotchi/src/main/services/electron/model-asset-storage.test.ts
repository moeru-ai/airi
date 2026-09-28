import type { ModelAsset } from '@proj-airi/stage-shared/model-assets'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileModelAssetStorage } from './model-asset-storage'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

const model: ModelAsset = {
  id: 'speech',
  revision: 'v1',
  source: 'remote',
  files: [
    { name: 'data', url: 'https://example.test/data' },
    { name: 'metadata', url: 'https://example.test/metadata' },
  ],
}

const directories: string[] = []

async function storage(download: typeof fetch) {
  const directory = await mkdtemp(join(tmpdir(), 'airi-model-assets-'))
  directories.push(directory)
  return new FileModelAssetStorage(directory, download)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('electron model asset storage', () => {
  it('installs a complete model pair and detects missing files', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const store = await storage(download)

    await store.install(model, () => {}, new AbortController().signal)

    expect(await store.has(model)).toBe(true)
    expect(download).toHaveBeenCalledTimes(2)
    await store.remove(model)
    expect(await store.has(model)).toBe(false)
  })

  it('does not publish a pair when the second file fails', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/metadata'))
        return new Response('unavailable', { status: 503 })
      return new Response('data')
    })
    const store = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toThrow('503')
    expect(await store.has(model)).toBe(false)
  })
})
