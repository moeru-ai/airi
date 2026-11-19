import type { StickerEntry } from '../../types/sticker'

import indexedDbDriver from 'unstorage/drivers/indexedb'

import { createStorage, prefixStorage } from 'unstorage'

import { listRawItems, storage } from '../storage'

const WRITE_LOCK = 'airi:sticker-library-write'

const entries = prefixStorage(storage, 'stickers:entries')
const images = prefixStorage(storage, 'stickers:images')

/** The database that releases before the unstorage migration wrote. It has one store for entries and one for images. */
const previousDatabase = 'airi-stickers'
const migratedKey = `migrated-from:${previousDatabase}`

// NOTICE:
// Earlier releases kept stickers in two stores of `airi-stickers`. idb-keyval creates only one store in a new database.
// The copy keeps the old database for rollback.
// Source: `createStore` in node_modules/idb-keyval/dist/index.js.
// Removal condition: one stable release after this copy ships. Then delete the old database.

let migration: Promise<void> | undefined
/**
 * Takes no Web Lock, because `get` and `save` run inside the store's write lock.
 * It writes only keys that the new store does not have, so windows can run it together.
 */
function migrateFromPreviousDatabase() {
  migration ??= (async () => {
    if (await storage.hasItem(`stickers:${migratedKey}`))
      return
    const databases = await indexedDB.databases()
    if (databases.some(database => database.name === previousDatabase)) {
      for (const [target, storeName] of [[entries, 'entries'], [images, 'images']] as const) {
        const previous = createStorage({ driver: indexedDbDriver({ dbName: previousDatabase, storeName }) })
        // localforage created each store on its first use, so an old database can lack one of them.
        const records = await listRawItems<unknown>(previous, '').catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'NotFoundError')
            return []
          throw error
        })
        for (const [key, value] of records) {
          // A record that this release already wrote is newer than the copy.
          if (!await target.hasItem(key))
            await target.setItemRaw(key, value)
        }
      }
    }
    await storage.setItemRaw(`stickers:${migratedKey}`, Date.now())
  })().finally(() => {
    // Calls that start later read the marker again. A failed copy then runs again.
    migration = undefined
  })
  return migration
}

/** Device-local library. Immutable image versions remain available to saved and queued replies. */
export const stickersRepo = {
  async read() {
    return navigator.locks.request(WRITE_LOCK, async () => {
      await migrateFromPreviousDatabase()
      const [records, artwork] = await Promise.all([
        listRawItems<StickerEntry>(entries, ''),
        listRawItems<Blob>(images, ''),
      ])
      return {
        records: records.map(([, entry]) => entry),
        images: artwork.map(([id, blob]) => ({ id, blob })),
      }
    })
  },
  async get(id: string) {
    await migrateFromPreviousDatabase()
    return entries.getItemRaw<StickerEntry>(id)
  },
  async save(entry: StickerEntry) {
    await migrateFromPreviousDatabase()
    await entries.setItemRaw(entry.id, entry)
  },
  async saveImage(id: string, blob: Blob) {
    await migrateFromPreviousDatabase()
    await images.setItemRaw(id, blob)
  },
}
