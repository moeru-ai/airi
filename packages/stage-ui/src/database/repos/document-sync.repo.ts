import type { SyncState } from '../../libs/document-sync'

import { storage } from '../storage'

// The sync state belongs to one account. The local documents belong to the
// device, so a second account on the device starts without sync history.
const stateKey = (collection: string, userId: string) => `local:document-sync/${collection}/${userId}`

export const documentSyncRepo = {
  async getState(collection: string, userId: string) {
    return await storage.getItemRaw<SyncState>(stateKey(collection, userId))
  },

  async saveState(collection: string, userId: string, state: SyncState) {
    await storage.setItemRaw(stateKey(collection, userId), state)
  },
}
