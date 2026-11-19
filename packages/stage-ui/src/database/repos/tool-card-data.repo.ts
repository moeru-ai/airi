import { storage } from '../storage'

// A tool key can hold `::` for an MCP tool, and the storage reads `:` as a separator. A card version is its `createdAt`.
const keyOf = (tool: string, version: number) => `local:tool-cards/latest/${encodeURIComponent(tool)}/${version}`

/**
 * One saved result. The storage writes a top-level string without quotes and reads a string that looks like JSON as
 * another type, so the result sits in a field and every JSON value comes back as it was saved.
 */
interface LatestCallRecord {
  data: unknown
}

/**
 * The result of the latest call of each tool that has a card, for each version of its card. The settings page draws
 * the preview of a card with it.
 *
 * - It lives apart from the cards, so a large result neither fills localStorage nor travels with the cards between
 *   windows. A result is JSON data, and it is stored as JSON, because a result from the chat can be a reactive object
 *   that IndexedDB cannot clone.
 * - Each card version has its own result. A new card that fails to save leaves the card before it with its preview.
 */
export const toolCardDataRepo = {
  /** The saved result of a card version, or undefined when it has none. */
  async get(tool: string, version: number) {
    const record = await storage.getItem(keyOf(tool, version)) as LatestCallRecord | null
    return record ? record.data : undefined
  },
  async set(tool: string, version: number, data: unknown) {
    const record: LatestCallRecord = { data }
    await storage.setItem(keyOf(tool, version), record)
  },
  async remove(tool: string, version: number) {
    await storage.removeItem(keyOf(tool, version))
  },
}
