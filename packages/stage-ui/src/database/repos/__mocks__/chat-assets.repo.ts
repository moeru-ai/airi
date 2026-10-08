import type { ChatAssetRecord } from '../chat-assets.repo'

/** In-memory asset store for Node tests, which have no IndexedDB or Web Locks. */
const assets = new Map<string, ChatAssetRecord>()

export const chatAssetsRepo = {
  async get(id: string) {
    return assets.get(id) ?? null
  },
  async put(id: string, blob: Blob, mimeType: string, owner: string) {
    const existing = assets.get(id)
    if (existing?.owners.includes(owner))
      return
    assets.set(id, existing ? { ...existing, owners: [...existing.owners, owner] } : { blob, mimeType, owners: [owner] })
  },
  async retain(ids: Iterable<string>, owner: string) {
    for (const id of new Set(ids)) {
      const existing = assets.get(id)
      if (existing && !existing.owners.includes(owner))
        assets.set(id, { ...existing, owners: [...existing.owners, owner] })
    }
  },
  async release(ids: Iterable<string>, owner: string) {
    for (const id of new Set(ids)) {
      const record = assets.get(id)
      if (!record?.owners.includes(owner))
        continue
      const owners = record.owners.filter(item => item !== owner)
      if (owners.length)
        assets.set(id, { ...record, owners })
      else
        assets.delete(id)
    }
  },
  async releaseOwner(owner: string) {
    for (const [id, record] of assets) {
      const owners = record.owners.filter(item => item !== owner)
      if (owners.length)
        assets.set(id, { ...record, owners })
      else
        assets.delete(id)
    }
  },
  async clear() {
    assets.clear()
  },
}
