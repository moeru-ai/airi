/** One remembered fact. A character keeps it on its own card. A general memory reaches every card. */
export interface MemoryEntry {
  /** A UUIDv7 that the store makes when it adds the entry. The index lists it, and tools address the entry by it. */
  id: string
  /** The index line: the fact itself when it fits in one line, or when the entry matters. */
  description: string
  body: string
  /** The character card that owns this memory. Without it, the owner made the memory general. */
  persona?: string
  updatedAt: number
}

/** A fact to save. The id of one of the card's own entries changes that entry. Without it, the write adds an entry. */
export interface MemoryWrite {
  id?: string
  description: string
  body: string
}
