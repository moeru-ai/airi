import type { Storage } from 'unstorage'

import indexedDbDriver from 'unstorage/drivers/indexedb'
import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'

export const storage = createStorage({
  driver: memoryDriver(),
})

storage.mount('local', indexedDbDriver({ base: 'airi-local' }))
storage.mount('outbox', indexedDbDriver({ base: 'airi-sync-queue' }))

// The `device` and `chat-assets` stores are the ones that localforage created. Their names are permanent, because user files live in them.
// Read and write raw values, because the records hold `Blob` and `File` objects.

// Do not call `clear()` on `device` or the root storage. `device` holds every imported model, background, and motion.
// Do not list keys of `local` or `outbox`. The driver returns them with the `base` prefix, so they do not resolve.

/** Imported display models, backgrounds, and their pending uploads. Each kind has its own key prefix. */
storage.mount('device', indexedDbDriver({ dbName: 'localforage', storeName: 'keyvaluepairs' }))
/** Media of chat messages, keyed by content hash. */
storage.mount('chat-assets', indexedDbDriver({ dbName: 'airi-chat-assets', storeName: 'assets' }))
/** The sticker library. Entries and images have their own key prefixes. */
storage.mount('stickers', indexedDbDriver({ dbName: 'airi-sticker-library', storeName: 'records' }))

/**
 * Reads the raw value of each key that starts with `prefix`.
 *
 * Use it to list records whose IDs share a prefix in one store.
 * `getKeys(base)` cannot do this, because unstorage adds `:` to the end of the base.
 */
export async function listRawItems<T>(store: Storage, prefix: string) {
  const keys = (await store.getKeys()).filter(key => key.startsWith(prefix))
  const items = await Promise.all(keys.map(async key => ({ key, value: await store.getItemRaw<T>(key) })))
  return items.flatMap(({ key, value }) => value == null ? [] : [[key, value] as const])
}
