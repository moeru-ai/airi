import { storage } from '../storage'

// A tool key can hold `::` for an MCP tool, and the storage reads `:` as a separator.
const keyOf = (tool: string) => `local:tool-cards/latest/${encodeURIComponent(tool)}`

/**
 * The result of the latest call of each tool that has a card. The settings page draws the preview of a card with it.
 * It lives apart from the cards, so a large result neither fills localStorage nor travels with the cards between windows.
 */
export const toolCardDataRepo = {
  async get(tool: string) {
    return await storage.getItemRaw<unknown>(keyOf(tool)) ?? undefined
  },
  async set(tool: string, data: unknown) {
    await storage.setItemRaw(keyOf(tool), data)
  },
  async remove(tool: string) {
    await storage.removeItem(keyOf(tool))
  },
}
