import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useHostEventaInvoke } from '@proj-airi/stage-host-context'
import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'

import { electronMcpReadConfigText } from '../../../../shared/eventa'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'

/** The marker of a saved server's row. The page and the provider share it. */
export function mcpServerSearchKey(identifier: string) {
  return settingsSearchItemKey('mcp-server', identifier)
}

/** Lists the saved MCP servers by name, from the config file that the page edits. */
const provideMcpServers: SettingsSearchProvider = async () => {
  const { text } = await useHostEventaInvoke(electronMcpReadConfigText)()
  return Object.keys(parseElectronMcpConfigText(text).mcpServers)
    .map(identifier => ({ title: identifier, key: mcpServerSearchKey(identifier) }))
}

export default provideMcpServers
