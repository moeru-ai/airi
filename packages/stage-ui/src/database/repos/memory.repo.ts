import type { MemoryEntry } from '../../types/memory'

import localforage from 'localforage'

/** A removed entry stays as a tombstone with the time of the removal, so a later sync can remove it on other devices. */
interface MemoryTombstone {
  id: string
  updatedAt: number
  deleted: true
}

type MemoryRecord = MemoryEntry | MemoryTombstone

const records = localforage.createInstance({ name: 'airi-memory', storeName: 'entries' })

/** Long-term memory on this device, one record for each entry, keyed by the entry id. */
export const memoryRepo = {
  /** The entries that are not removed, oldest change first. */
  async list() {
    const entries: MemoryEntry[] = []
    await records.iterate<MemoryRecord, void>((record) => {
      if (!('deleted' in record))
        entries.push(record)
    })
    return entries.sort((left, right) => left.updatedAt - right.updatedAt)
  },
  async save(entries: MemoryEntry[]) {
    await Promise.all(entries.map(entry => records.setItem(entry.id, entry)))
  },
  /** Replaces each entry with a tombstone. */
  async remove(ids: string[], updatedAt: number) {
    await Promise.all(ids.map(id => records.setItem<MemoryTombstone>(id, { id, updatedAt, deleted: true })))
  },
  /** Deletes every record, tombstones too. Only deleting all data uses it. */
  async clear() {
    await records.clear()
  },
}
