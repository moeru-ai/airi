import type { ModelAsset } from '@proj-airi/stage-shared/model-assets'

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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
  return { directory, store: new FileModelAssetStorage(directory, download) }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('electron model asset storage', () => {
  it('installs a complete model pair and detects missing files', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const { store } = await storage(download)

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
    const { store } = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'server', host: 'example.test', status: 503 })
    expect(await store.has(model)).toBe(false)
  })

  it('does not retry a file that the host reports as missing', async () => {
    const download = vi.fn(async () => new Response('missing', { status: 404 }))
    const { store } = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'server', status: 404 })
    expect(download).toHaveBeenCalledOnce()
  })

  it('reports a connection failure as a network failure', async () => {
    // Node fetch rejects with this TypeError when it cannot reach the host.
    const download = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('Connect Timeout Error') })
    })
    const { store } = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'network', host: 'example.test' })
    // ofetch retries a failed connection one time before it gives up.
    expect(download).toHaveBeenCalledTimes(2)
    expect(await store.has(model)).toBe(false)
  })

  it('reports a transfer that breaks midway as a network failure', async () => {
    const download = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('part'))
      },
      pull(controller) {
        controller.error(new TypeError('terminated'))
      },
    })))
    const { store } = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'network' })
    expect(await store.has(model)).toBe(false)
  })

  it('cancels the response body when the install stops before the body ends', async () => {
    const cancel = vi.fn()
    const download = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('part'))
      },
      cancel,
    })))
    const { store } = await storage(download)
    const controller = new AbortController()

    // The mocked download ignores the signal, so only the storage can close the body.
    await expect(store.install(model, () => controller.abort(), controller.signal)).rejects.toThrow()
    expect(cancel).toHaveBeenCalledOnce()
    expect(await store.has(model)).toBe(false)
  })

  it('reports a transfer shorter than its content length as incomplete', async () => {
    const download = vi.fn(async () => new Response('part', { headers: { 'content-length': '100' } }))
    const { store } = await storage(download)

    await expect(store.install(model, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'incomplete' })
  })

  it('removes staging directories that a killed download left behind', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const { directory, store } = await storage(download)
    const stale = join(directory, 'speech', '.download-a1b2c3')
    await mkdir(stale, { recursive: true })
    await writeFile(join(stale, 'data'), 'partial')

    await store.install(model, () => {}, new AbortController().signal)

    expect(await readdir(join(directory, 'speech'))).toEqual(['v1'])
    expect(await store.has(model)).toBe(true)
  })

  it('reclaims superseded revisions after a new revision commits', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const { directory, store } = await storage(download)
    await store.install(model, () => {}, new AbortController().signal)

    const next: ModelAsset = { ...model, revision: 'v2' }
    await store.install(next, () => {}, new AbortController().signal)

    expect(await readdir(join(directory, 'speech'))).toEqual(['v2'])
    expect(await store.has(next)).toBe(true)
    expect(await store.has(model)).toBe(false)
  })

  it('removes every revision of a model', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const { directory, store } = await storage(download)
    await mkdir(join(directory, 'speech', 'v0'), { recursive: true })
    await store.install(model, () => {}, new AbortController().signal)
    await mkdir(join(directory, 'speech', 'v0'), { recursive: true })

    await store.remove(model)

    expect(await readdir(directory)).toEqual([])
  })

  it('clears every stored model', async () => {
    const download = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)))
    const { directory, store } = await storage(download)
    await store.install(model, () => {}, new AbortController().signal)
    await mkdir(join(directory, 'retired', 'v0'), { recursive: true })

    await store.clear()

    await expect(readdir(directory)).rejects.toThrow('ENOENT')
  })
})
