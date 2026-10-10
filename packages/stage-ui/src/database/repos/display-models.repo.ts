import type { Storage } from 'unstorage'

import type { TransferTask } from '../../libs/file-transfer/transfer-queue'
import type { DisplayModelFile } from '../../stores/display-models'

import localforage from 'localforage'

import { storage as sharedStorage } from '../storage'

/** The part of localforage that the migration reads. */
export interface LegacyModelStore {
  iterate: (callback: (value: Omit<DisplayModelFile, 'id'>, key: string) => void) => Promise<unknown>
  removeItem: (key: string) => Promise<unknown>
}

const modelBase = 'local:display-models'
const uploadBase = 'local:display-model-uploads'

const modelKey = (id: string) => `${modelBase}/${id}`
const uploadKey = (id: string) => `${uploadBase}/${id}`

/**
 * Device storage for imported display models and their pending uploads.
 * Records hold a `File`, so every call uses the raw API. The JSON API would drop the bytes.
 */
export function createDisplayModelsRepo(storage: Storage, legacy: LegacyModelStore) {
  async function readAll<T>(base: string) {
    const keys = await storage.getKeys(base)
    const items = await Promise.all(keys.map(key => storage.getItemRaw<T>(key)))
    return items.filter(item => item !== null && item !== undefined)
  }

  return {
    list: () => readAll<DisplayModelFile>(modelBase),

    async get(id: string) {
      return await storage.getItemRaw<DisplayModelFile>(modelKey(id)) ?? undefined
    },

    async save(model: DisplayModelFile) {
      await storage.setItemRaw(modelKey(model.id), model)
    },

    async remove(id: string) {
      await storage.removeItem(modelKey(id))
    },

    listUploads: () => readAll<TransferTask>(uploadBase),

    async saveUpload(task: TransferTask) {
      await storage.setItemRaw(uploadKey(task.id), task)
    },

    async removeUpload(id: string) {
      await storage.removeItem(uploadKey(id))
    },

    // NOTICE:
    // Moves models that earlier versions stored with localforage into the shared storage.
    // Without it, users lose their imported models after the storage change.
    // Source/context: stores/display-models.ts used localforage keys `display-model-*` before this change.
    // Removal condition: releases that wrote localforage records are no longer supported.
    async migrateFromLocalforage() {
      const legacyModels: DisplayModelFile[] = []
      await legacy.iterate((value, key) => {
        if (key.startsWith('display-model-'))
          legacyModels.push({ ...value, id: key })
      })

      for (const model of legacyModels) {
        if (!await storage.hasItem(modelKey(model.id)))
          await storage.setItemRaw(modelKey(model.id), model)
        await legacy.removeItem(model.id)
      }
    },
  }
}

export const displayModelsRepo = createDisplayModelsRepo(sharedStorage, localforage)
