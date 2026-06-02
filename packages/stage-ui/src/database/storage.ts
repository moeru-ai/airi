import indexedDbDriver from 'unstorage/drivers/indexedb'
import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'

export const storage = createStorage({
  driver: memoryDriver(),
})

storage.mount('local', indexedDbDriver({ base: 'airi-local' }))
storage.mount('outbox', indexedDbDriver({ base: 'airi-sync-queue' }))
// Long-term memory records (vectors + metadata). Separate IndexedDB so memory can be inspected /
// cleared independently of chat history. Persistent and shared across same-origin windows.
storage.mount('memory', indexedDbDriver({ base: 'airi-memory' }))
