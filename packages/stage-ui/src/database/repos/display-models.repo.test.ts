import type { DisplayModelFile } from '../../stores/display-models'
import type { DisplayModelStore } from './display-models.repo'

import { describe, expect, it } from 'vitest'

import { DisplayModelFormat } from '../../stores/display-models'
import { createDisplayModelsRepo } from './display-models.repo'

/** A localforage stand-in. Node has no IndexedDB for localforage to select. */
function createStore(records: Record<string, unknown> = {}): DisplayModelStore {
  return {
    getItem: async <T>(key: string) => (records[key] as T | undefined) ?? null,
    setItem: async <T>(key: string, value: T) => {
      records[key] = value
      return value
    },
    removeItem: async (key) => {
      delete records[key]
    },
    iterate: async <T, U>(callback: (value: T, key: string) => U) => {
      let result: U | undefined
      for (const [key, value] of Object.entries(records))
        result = callback(value as T, key)
      return result as U
    },
  }
}

function model(id: string, name = 'model.zip'): DisplayModelFile {
  return { id, format: DisplayModelFormat.Live2dZip, type: 'file', file: new File(['model'], 'model.zip'), name, importedAt: 1 }
}

describe('displayModelsRepo', () => {
  it('keeps the file bytes of a saved model', async () => {
    const repo = createDisplayModelsRepo(createStore())

    await repo.save(model('display-model-a'))

    const stored = await repo.get('display-model-a')
    expect(await stored!.file.text()).toBe('model')
    expect(await repo.list()).toHaveLength(1)
    await repo.remove('display-model-a')
    expect(await repo.get('display-model-a')).toBeUndefined()
  })

  it('keeps models, pending uploads, and other keys apart', async () => {
    const records: Record<string, unknown> = { 'background-1': { id: 'background-1' } }
    const repo = createDisplayModelsRepo(createStore(records))

    await repo.save(model('display-model-a'))
    await repo.saveUpload({ id: 'display-model-a', kind: 'upload', ownerId: 'owner', payload: null, status: 'queued' })

    expect(await repo.list()).toMatchObject([{ id: 'display-model-a' }])
    expect(await repo.listUploads()).toMatchObject([{ kind: 'upload' }])
    await repo.removeUpload('display-model-a')
    expect(await repo.list()).toHaveLength(1)
    expect(records['background-1']).toEqual({ id: 'background-1' })
  })

  it('reads records that earlier releases wrote', async () => {
    const file = new File(['model'], 'original.zip')
    const repo = createDisplayModelsRepo(createStore({
      'display-model-old': { format: DisplayModelFormat.Live2dZip, file, importedAt: 1 },
      'display-model-renamed': { format: DisplayModelFormat.Live2dZip, file, importedAt: 2, name: 'Renamed' },
    }))

    expect(await repo.list()).toMatchObject([
      { id: 'display-model-old', type: 'file', name: 'original.zip' },
      { id: 'display-model-renamed', type: 'file', name: 'Renamed' },
    ])
  })
})
