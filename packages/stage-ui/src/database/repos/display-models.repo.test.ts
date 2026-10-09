import type { DisplayModelFile } from '../../stores/display-models'
import type { LegacyModelStore } from './display-models.repo'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { describe, expect, it } from 'vitest'

import { DisplayModelFormat } from '../../stores/display-models'
import { createDisplayModelsRepo } from './display-models.repo'

function createLegacyStore(records: Record<string, Omit<DisplayModelFile, 'id'>>): LegacyModelStore {
  return {
    iterate: async (callback) => {
      for (const [key, value] of Object.entries(records))
        callback(value, key)
    },
    removeItem: async (key) => {
      delete records[key]
    },
  }
}

function model(id: string, name = 'model.zip'): DisplayModelFile {
  return { id, format: DisplayModelFormat.Live2dZip, type: 'file', file: new File(['model'], 'model.zip'), name, importedAt: 1 }
}

describe('displayModelsRepo', () => {
  it('keeps the file bytes of a saved model', async () => {
    const repo = createDisplayModelsRepo(createStorage({ driver: memoryDriver() }), createLegacyStore({}))

    await repo.save(model('display-model-a'))

    const stored = await repo.get('display-model-a')
    expect(await stored!.file.text()).toBe('model')
    expect(await repo.list()).toHaveLength(1)
    await repo.remove('display-model-a')
    expect(await repo.get('display-model-a')).toBeUndefined()
  })

  it('keeps models and pending uploads apart', async () => {
    const repo = createDisplayModelsRepo(createStorage({ driver: memoryDriver() }), createLegacyStore({}))

    await repo.save(model('display-model-a'))
    await repo.saveUpload({ id: 'display-model-a', kind: 'upload', ownerId: 'owner', payload: null, status: 'queued' })

    expect(await repo.list()).toHaveLength(1)
    expect(await repo.listUploads()).toMatchObject([{ kind: 'upload' }])
    await repo.removeUpload('display-model-a')
    expect(await repo.list()).toHaveLength(1)
  })

  it('moves legacy models once and leaves other legacy keys alone', async () => {
    const { id: _id, ...legacyModel } = model('display-model-old', 'Renamed')
    const records = { 'display-model-old': legacyModel, 'background-1': legacyModel }
    const repo = createDisplayModelsRepo(createStorage({ driver: memoryDriver() }), createLegacyStore(records))

    await repo.migrateFromLocalforage()
    await repo.migrateFromLocalforage()

    expect(await repo.list()).toMatchObject([{ id: 'display-model-old', name: 'Renamed' }])
    expect(Object.keys(records)).toEqual(['background-1'])
  })

  it('does not replace a model that the new storage already has', async () => {
    const { id: _id, ...legacyModel } = model('display-model-a', 'Old name')
    const repo = createDisplayModelsRepo(createStorage({ driver: memoryDriver() }), createLegacyStore({ 'display-model-a': legacyModel }))
    await repo.save(model('display-model-a', 'New name'))

    await repo.migrateFromLocalforage()

    expect((await repo.get('display-model-a'))!.name).toBe('New name')
  })
})
