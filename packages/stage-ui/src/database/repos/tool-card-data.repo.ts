import type { StorageValue } from 'unstorage'

import { storage } from '../storage'

// A tool key can hold `::` for an MCP tool, and the storage reads `:` as a separator.
const keyOf = (tool: string) => `local:tool-cards/latest/${encodeURIComponent(tool)}`

/**
 * The result of the latest call of each tool that has a card. The settings page draws the preview of a card with it.
 * It lives apart from the cards, so a large result neither fills localStorage nor travels with the cards between windows.
 *
 * A result is JSON data, and it is stored as JSON. A result from the chat can be a reactive object, which IndexedDB
 * cannot clone.
 */
export const toolCardDataRepo = {
  async get(tool: string) {
    return await storage.getItem(keyOf(tool)) ?? undefined
  },
  async set(tool: string, data: unknown) {
    // A tool result is JSON data: a string, a number, a boolean, null, a list, or an object.
    await storage.setItem(keyOf(tool), data as StorageValue)
  },
  async remove(tool: string) {
    await storage.removeItem(keyOf(tool))
  },
}
