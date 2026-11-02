import type { MemoryEntry, MemoryWrite } from '../../../types/memory'

import { v7 as uuidv7 } from 'uuid'

/** In-memory long-term memory for Node tests, which have no IndexedDB. */
const entries = new Map<string, MemoryEntry>()

export const memoryRepo = {
  async list() {
    return [...entries.values()].sort((left, right) => left.updatedAt - right.updatedAt)
  },
  async add(added: MemoryEntry[]) {
    for (const entry of added)
      entries.set(entry.id, entry)
  },
  async write(input: MemoryWrite, persona: string, updatedAt: number) {
    const own = input.id ? entries.get(input.id) : undefined
    const entry: MemoryEntry = { id: own?.persona === persona ? own.id : uuidv7(), description: input.description, body: input.body, persona, updatedAt }
    entries.set(entry.id, entry)
    return entry
  },
  async makeGeneral(id: string, updatedAt: number) {
    const stored = entries.get(id)
    if (!stored?.persona)
      return false
    const { persona: _card, ...general } = stored
    entries.set(id, { ...general, updatedAt })
    return true
  },
  async forget(id: string, persona: string) {
    if (entries.get(id)?.persona !== persona)
      return false
    entries.delete(id)
    return true
  },
  async remove(ids: string[]) {
    for (const id of ids)
      entries.delete(id)
  },
  async clear() {
    entries.clear()
  },
}
