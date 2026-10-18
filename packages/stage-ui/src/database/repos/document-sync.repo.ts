import type { SyncState } from '../../libs/document-sync'

import { storage } from '../storage'

// The sync state belongs to one account and one feature. The local documents
// belong to the device, so a second account on the device starts without sync history.
const stateKey = (name: string, userId: string) => `local:document-sync/${name}/${userId}`

export const documentSyncRepo = {
  async getState(name: string, userId: string) {
    return await storage.getItemRaw<SyncState>(stateKey(name, userId))
  },

  async saveState(name: string, userId: string, state: SyncState) {
    await storage.setItemRaw(stateKey(name, userId), state)
  },
}
