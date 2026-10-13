import type { DisplayModelFile } from '../../stores/display-models'

import localforage from 'localforage'
import indexedDbDriver from 'unstorage/drivers/indexedb'

import { createStorage } from 'unstorage'
import { afterEach, expect, it } from 'vitest'

import { DisplayModelFormat } from '../../stores/display-models'
import { createDisplayModelsRepo } from './display-models.repo'

const base = 'airi-local-display-models-browser-test'

/** Opens the IndexedDB storage again, as a page reload does. */
function openStorage() {
  const storage = createStorage()
  storage.mount('local', indexedDbDriver({ base }))
  return storage
}

function bytes(size: number) {
  const data = new Uint8Array(size)
  for (let index = 0; index < size; index++)
    data[index] = (index * 31 + 7) % 251
  return data
}

afterEach(async () => {
  await localforage.clear()
  await openStorage().clear('local')
})

it('moves a localforage model into IndexedDB storage with the same bytes', async () => {
  const content = bytes(4 * 1024 * 1024)
  const legacyModel: DisplayModelFile = {
    id: 'display-model-legacy',
    format: DisplayModelFormat.VRM,
    type: 'file',
    file: new File([content], 'avatar.vrm', { type: 'model/gltf-binary' }),
    name: 'Renamed avatar',
    importedAt: 1,
  }
  await localforage.setItem(legacyModel.id, legacyModel)
  await localforage.setItem('background-legacy', { id: 'background-legacy' })

  await createDisplayModelsRepo(openStorage(), localforage).migrateFromLocalforage()

  const [migrated] = await createDisplayModelsRepo(openStorage(), localforage).list()
  expect(migrated).toMatchObject({ id: 'display-model-legacy', name: 'Renamed avatar', format: DisplayModelFormat.VRM, importedAt: 1 })
  expect(migrated.file).toBeInstanceOf(Blob)
  expect(migrated.file.name).toBe('avatar.vrm')
  expect(new Uint8Array(await migrated.file.arrayBuffer())).toEqual(content)
  expect(await localforage.getItem('display-model-legacy')).toBeNull()
  expect(await localforage.getItem('background-legacy')).toEqual({ id: 'background-legacy' })
})
