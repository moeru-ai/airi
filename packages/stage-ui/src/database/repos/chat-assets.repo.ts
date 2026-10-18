import localforage from 'localforage'

/** One stored asset. `owners` lists the chat sessions whose messages reference it. */
export interface ChatAssetRecord {
  blob: Blob
  mimeType: string
  owners: string[]
}

let instance: LocalForage | undefined
/** The store opens on first use. Importing the chat session modules then opens no database. */
function assets() {
  instance ??= localforage.createInstance({ name: 'airi-chat-assets', storeName: 'assets' })
  return instance
}

/**
 * Every write runs under one Web Lock, so windows that share this origin cannot lose each other's owner changes.
 * Reads take no lock, because a record is replaced as a whole.
 */
const WRITE_LOCK = 'airi:chat-assets-write'

/**
 * Device-local media of chat messages, keyed by content hash.
 *
 * An asset lives while at least one session owns it. Deleting the last owner deletes the bytes.
 */
export const chatAssetsRepo = {
  async get(id: string) {
    return assets().getItem<ChatAssetRecord>(id)
  },

  /** Stores the bytes once and adds `owner`. Storing the same bytes again only adds the owner. */
  async put(id: string, blob: Blob, mimeType: string, owner: string) {
    await navigator.locks.request(WRITE_LOCK, async () => {
      const existing = await assets().getItem<ChatAssetRecord>(id)
      if (existing?.owners.includes(owner))
        return
      await assets().setItem<ChatAssetRecord>(id, existing
        ? { ...existing, owners: [...existing.owners, owner] }
        : { blob, mimeType, owners: [owner] })
    })
  },

  /** Adds `owner` to assets that already exist. A missing asset is skipped, because its bytes are gone. */
  async retain(ids: Iterable<string>, owner: string) {
    await navigator.locks.request(WRITE_LOCK, async () => {
      for (const id of new Set(ids)) {
        const existing = await assets().getItem<ChatAssetRecord>(id)
        if (existing && !existing.owners.includes(owner))
          await assets().setItem<ChatAssetRecord>(id, { ...existing, owners: [...existing.owners, owner] })
      }
    })
  },

  /** Removes `owner` from the listed assets, and deletes the ones that no session owns any more. */
  async release(ids: Iterable<string>, owner: string) {
    await navigator.locks.request(WRITE_LOCK, async () => {
      for (const id of new Set(ids)) {
        const existing = await assets().getItem<ChatAssetRecord>(id)
        if (!existing?.owners.includes(owner))
          continue
        const owners = existing.owners.filter(item => item !== owner)
        if (owners.length)
          await assets().setItem<ChatAssetRecord>(id, { ...existing, owners })
        else
          await assets().removeItem(id)
      }
    })
  },

  /** Removes `owner` from every asset, and deletes the assets that no session owns any more. */
  async releaseOwner(owner: string) {
    await navigator.locks.request(WRITE_LOCK, async () => {
      const updates: [string, ChatAssetRecord | undefined][] = []
      await assets().iterate<ChatAssetRecord, void>((record, id) => {
        if (!record.owners.includes(owner))
          return
        const owners = record.owners.filter(item => item !== owner)
        updates.push([id, owners.length ? { ...record, owners } : undefined])
      })
      for (const [id, record] of updates) {
        if (record)
          await assets().setItem(id, record)
        else
          await assets().removeItem(id)
      }
    })
  },

  async clear() {
    await navigator.locks.request(WRITE_LOCK, () => assets().clear())
  },
}
