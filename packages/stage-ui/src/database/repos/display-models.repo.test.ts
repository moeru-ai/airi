import type { DisplayModelFile } from '../../stores/display-models'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { describe, expect, it } from 'vitest'

import { DisplayModelFormat } from '../../stores/display-models'
import { createDisplayModelsRepo } from './display-models.repo'

/** An in-memory store with the given raw records. Node has no IndexedDB. */
async function createStore(records: Record<string, unknown> = {}) {
  const store = createStorage({ driver: memoryDriver() })
  for (const [key, value] of Object.entries(records))
    await store.setItemRaw(key, value)
  return store
}

function model(id: string, name = 'model.zip'): DisplayModelFile {
  return { id, format: DisplayModelFormat.Live2dZip, type: 'file', file: new File(['model'], 'model.zip'), name, importedAt: 1 }
}

describe('displayModelsRepo', () => {
  it('keeps the file bytes of a saved model', async () => {
    const repo = createDisplayModelsRepo(await createStore())

    await repo.save(model('display-model-a'))

    const stored = await repo.get('display-model-a')
    expect(await stored!.file.text()).toBe('model')
    expect(await repo.list()).toHaveLength(1)
    await repo.remove('display-model-a')
    expect(await repo.get('display-model-a')).toBeUndefined()
  })

  it('keeps models, pending uploads, and other keys apart', async () => {
    const store = await createStore({ 'background-1': { id: 'background-1' } })
    const repo = createDisplayModelsRepo(store)

    await repo.save(model('display-model-a'))
    await repo.saveUpload({ id: 'display-model-a', kind: 'upload', ownerId: 'owner', payload: null, status: 'queued' })

    expect(await repo.list()).toMatchObject([{ id: 'display-model-a' }])
    expect(await repo.listUploads()).toMatchObject([{ kind: 'upload' }])
    await repo.removeUpload('display-model-a')
    expect(await repo.list()).toHaveLength(1)
    expect(await store.getItemRaw('background-1')).toEqual({ id: 'background-1' })
  })

  it('reads records that earlier releases wrote', async () => {
    const file = new File(['model'], 'original.zip')
    const repo = createDisplayModelsRepo(await createStore({
      'display-model-old': { format: DisplayModelFormat.Live2dZip, file, importedAt: 1 },
      'display-model-renamed': { format: DisplayModelFormat.Live2dZip, file, importedAt: 2, name: 'Renamed' },
    }))

    expect(await repo.list()).toMatchObject([
      { id: 'display-model-old', type: 'file', name: 'original.zip' },
      { id: 'display-model-renamed', type: 'file', name: 'Renamed' },
    ])
  })
})
