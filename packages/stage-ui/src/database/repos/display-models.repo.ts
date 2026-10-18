import type { Storage } from 'unstorage'

import type { TransferTask } from '../../libs/file-transfer/transfer-queue'
import type { DisplayModelFile } from '../../stores/display-models'

import { prefixStorage } from 'unstorage'

import { listRawItems, storage } from '../storage'

type StoredDisplayModel = Omit<DisplayModelFile, 'id' | 'type' | 'name'> & { name?: string }

const modelPrefix = 'display-model-'
const uploadPrefix = 'transfer-task-'

/**
 * Device storage for imported display models and their pending uploads.
 * Models keep the keys that earlier releases wrote, so existing imports stay in place.
 */
export function createDisplayModelsRepo(store: Storage) {
  return {
    async list() {
      const models = await listRawItems<StoredDisplayModel>(store, modelPrefix)
      return models.map(([id, value]): DisplayModelFile => ({ ...value, id, type: 'file', name: value.name ?? value.file.name }))
    },

    async get(id: string) {
      return await store.getItemRaw<DisplayModelFile>(id) ?? undefined
    },

    async save(model: DisplayModelFile) {
      await store.setItemRaw(model.id, model)
    },

    async remove(id: string) {
      await store.removeItem(id)
    },

    async listUploads() {
      const tasks = await listRawItems<TransferTask>(store, uploadPrefix)
      return tasks.map(([, task]) => task)
    },

    async saveUpload(task: TransferTask) {
      await store.setItemRaw(`${uploadPrefix}${task.id}`, task)
    },

    async removeUpload(id: string) {
      await store.removeItem(`${uploadPrefix}${id}`)
    },
  }
}

export const displayModelsRepo = createDisplayModelsRepo(prefixStorage(storage, 'device'))
