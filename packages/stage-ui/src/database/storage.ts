import { createStorage } from 'unstorage'
import indexedDbDriver from 'unstorage/drivers/indexedb'

import memoryDriver from 'unstorage/drivers/memory'

export const storage = createStorage({
  driver: memoryDriver(),
})

storage.mount('local', indexedDbDriver({ base: 'airi-local' }))
storage.mount('outbox', indexedDbDriver({ base: 'airi-sync-queue' }))
