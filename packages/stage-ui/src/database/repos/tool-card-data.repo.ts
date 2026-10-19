import { storage } from '../storage'

// A tool key can hold `::` for an MCP tool, and the storage reads `:` as a separator.
const keyOf = (tool: string) => `local:tool-cards/latest/${encodeURIComponent(tool)}`

/**
 * One saved result. The storage writes a top-level string without quotes and reads a string that looks like JSON as
 * another type, so the result sits in a field and every JSON value comes back as it was saved.
 */
interface LatestCallRecord {
  data: unknown
}

/**
 * The result of the latest call of each tool that has a card. The settings page draws the preview of a card with it.
 * It lives apart from the cards, so a large result neither fills localStorage nor travels with the cards between windows.
 *
 * A result is JSON data, and it is stored as JSON. A result from the chat can be a reactive object, which IndexedDB
 * cannot clone.
 */
export const toolCardDataRepo = {
  /** The saved result, or undefined when the tool has none. */
  async get(tool: string) {
    const record = await storage.getItem(keyOf(tool)) as LatestCallRecord | null
    return record ? record.data : undefined
  },
  async set(tool: string, data: unknown) {
    const record: LatestCallRecord = { data }
    await storage.setItem(keyOf(tool), record)
  },
  async remove(tool: string) {
    await storage.removeItem(keyOf(tool))
  },
}
