import type { MemoryEntry } from '../../../types/memory'

/** In-memory long-term memory for Node tests, which have no IndexedDB. */
const entries = new Map<string, MemoryEntry>()

export const memoryRepo = {
  async list() {
    return [...entries.values()].sort((left, right) => left.updatedAt - right.updatedAt)
  },
  async save(saved: MemoryEntry[]) {
    for (const entry of saved)
      entries.set(entry.id, entry)
  },
  async remove(ids: string[]) {
    for (const id of ids)
      entries.delete(id)
  },
  async clear() {
    entries.clear()
  },
}
