import type { MemoryEntry, MemoryWrite } from '../../types/memory'

import { prefixStorage } from 'unstorage'
import { v7 as uuidv7 } from 'uuid'

import { listRawItems, storage } from '../storage'

/** A removed entry stays as a tombstone with the time of the removal, so a later sync can remove it on other devices. */
interface MemoryTombstone {
  id: string
  updatedAt: number
  deleted: true
}

type StoredMemory = MemoryEntry | MemoryTombstone

const records = prefixStorage(storage, 'memory')

/**
 * Runs one write. Every write of every window takes this lock, so a write that reads the stored records sees every
 * write before it, and no other write lands between its read and its save.
 */
function write<T>(run: () => Promise<T>) {
  return navigator.locks.request('airi:memory', run)
}

/** The stored entry with this id, or undefined when it is missing or removed. */
async function storedEntry(id: string) {
  const stored = await records.getItemRaw<StoredMemory>(id)
  return stored && !('deleted' in stored) ? stored : undefined
}

/** Long-term memory on this device, one record for each entry, keyed by the entry id. */
export const memoryRepo = {
  /** The entries that are not removed, oldest change first. */
  async list() {
    const entries = (await listRawItems<StoredMemory>(records, ''))
      .map(([, record]) => record)
      .filter((record): record is MemoryEntry => !('deleted' in record))
    return entries.sort((left, right) => left.updatedAt - right.updatedAt)
  },
  /** Adds entries as they are, with their ids. Only the move from localStorage uses it. */
  async add(entries: MemoryEntry[]) {
    await write(() => Promise.all(entries.map(entry => records.setItemRaw<MemoryEntry>(entry.id, entry))))
  },
  /** Replaces the stored entries as one operation against other windows' writes. */
  async replace(entries: MemoryEntry[]) {
    await write(async () => {
      await records.clear()
      await Promise.all(entries.map(entry => records.setItem<MemoryEntry>(entry.id, entry)))
    })
  },
  /**
   * Saves a fact on the card of `persona`, on the stored records. An id of the card's own stored entry replaces that
   * entry. Any other id, for example of a general or a removed entry, adds a new entry with a new id.
   * Resolves to the stored entry.
   */
  async write(input: MemoryWrite, persona: string, updatedAt: number) {
    return write(async () => {
      const own = input.id ? await storedEntry(input.id) : undefined
      const entry: MemoryEntry = {
        id: own?.persona === persona ? own.id : uuidv7(),
        description: input.description,
        body: input.body,
        persona,
        updatedAt,
      }
      await records.setItemRaw<MemoryEntry>(entry.id, entry)
      return entry
    })
  },
  /** Makes a card's stored entry general. Resolves to whether it changed. */
  async makeGeneral(id: string, updatedAt: number) {
    return write(async () => {
      const stored = await storedEntry(id)
      if (!stored?.persona)
        return false
      const { persona: _card, ...general } = stored
      await records.setItemRaw<MemoryEntry>(id, { ...general, updatedAt })
      return true
    })
  },
  /**
   * Replaces the entry with a tombstone when it still belongs to the card of `persona`. General memories belong to the
   * owner, so a run cannot forget them. Resolves to whether it removed the entry.
   */
  async forget(id: string, persona: string, updatedAt: number) {
    return write(async () => {
      if ((await storedEntry(id))?.persona !== persona)
        return false
      await records.setItemRaw<MemoryTombstone>(id, { id, updatedAt, deleted: true })
      return true
    })
  },
  /** Replaces each entry with a tombstone, whoever owns it. Only the owner removes entries this way, in Settings. */
  async remove(ids: string[], updatedAt: number) {
    await write(() => Promise.all(ids.map(id => records.setItemRaw<MemoryTombstone>(id, { id, updatedAt, deleted: true }))))
  },
  /** Deletes every record, tombstones too. Only deleting all data uses it. */
  async clear() {
    await write(() => records.clear())
  },
}
