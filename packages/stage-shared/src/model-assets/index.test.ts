import type { ModelAsset, ModelAssetProgress, ModelAssetStorage } from './index'

import { describe, expect, it, vi } from 'vitest'

import { ModelAssetRepository } from './index'

const remote: ModelAsset = {
  id: 'speech',
  revision: 'v1',
  source: 'remote',
  files: [
    { name: 'data', url: 'https://example.test/speech/v1/data' },
    { name: 'metadata', url: 'https://example.test/speech/v1/metadata' },
  ],
}

function createStorage() {
  const installed = new Set<string>()
  const install = vi.fn(async (model: ModelAsset, onProgress: (progress: ModelAssetProgress) => void, signal: AbortSignal) => {
    onProgress({ file: 'data', loaded: 1, total: 2 })
    signal.throwIfAborted()
    installed.add(`${model.id}@${model.revision}`)
  })
  const storage: ModelAssetStorage = {
    has: async model => installed.has(`${model.id}@${model.revision}`),
    install,
    open: async (_model, file) => new Response(file.name),
    remove: async (model) => { installed.delete(`${model.id}@${model.revision}`) },
  }
  return { installed, install, storage }
}

describe('model asset repository', () => {
  it('downloads a model once and reports installed only after both files are committed', async () => {
    const { install, storage } = createStorage()
    const repository = new ModelAssetRepository([remote], storage)
    const events: string[] = []
    repository.subscribe(status => events.push(status.state))

    const [data, metadata] = await Promise.all([
      repository.open('speech', 'data'),
      repository.open('speech', 'metadata'),
    ])

    expect(await data.text()).toBe('data')
    expect(await metadata.text()).toBe('metadata')
    expect(install).toHaveBeenCalledOnce()
    expect(events).toEqual(['downloading', 'downloading', 'installed'])
    expect(repository.list()[0]?.state).toBe('installed')
  })

  it('keeps an incomplete model out of the installed state', async () => {
    const { storage } = createStorage()
    storage.install = async () => {}
    const repository = new ModelAssetRepository([remote], storage)

    await expect(repository.ensureAvailable('speech')).rejects.toThrow('not committed')
    expect(repository.list()[0]?.state).toBe('error')
    expect(await repository.inspect('speech')).toMatchObject({ state: 'error' })
  })

  it('removes only a remote model version', async () => {
    const { storage } = createStorage()
    const bundled: ModelAsset = { ...remote, id: 'built-in', source: 'bundled' }
    const repository = new ModelAssetRepository([remote, bundled], storage)

    await repository.ensureAvailable('speech')
    await repository.remove('speech')

    expect(repository.list().find(status => status.id === 'speech')?.state).toBe('missing')
    await expect(repository.remove('built-in')).rejects.toThrow('cannot be removed')
  })

  it('keeps a shared download when one caller aborts', async () => {
    const { storage, installed } = createStorage()
    let finish!: () => void
    let installs = 0
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    storage.install = async (model, _onProgress, signal) => {
      installs++
      await gate
      signal.throwIfAborted()
      installed.add(`${model.id}@${model.revision}`)
    }
    const repository = new ModelAssetRepository([remote], storage)
    const controller = new AbortController()
    const first = repository.ensureAvailable('speech', controller.signal)
    const second = repository.ensureAvailable('speech')

    controller.abort()
    await expect(first).rejects.toThrow()
    finish()
    await second

    expect(installs).toBe(1)
    expect(repository.list()[0]?.state).toBe('installed')
  })

  it('starts a new install after canceling the last caller', async () => {
    const { storage, installed } = createStorage()
    let installs = 0
    storage.install = async (model, _onProgress, signal) => {
      installs++
      signal.throwIfAborted()
      if (installs === 1) {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      installed.add(`${model.id}@${model.revision}`)
    }
    const repository = new ModelAssetRepository([remote], storage)
    const controller = new AbortController()
    const first = repository.ensureAvailable('speech', controller.signal)

    controller.abort()
    await expect(first).rejects.toThrow()
    const second = repository.ensureAvailable('speech')
    await second

    expect(installs).toBe(2)
    expect(repository.list()[0]?.state).toBe('installed')
  })
})
