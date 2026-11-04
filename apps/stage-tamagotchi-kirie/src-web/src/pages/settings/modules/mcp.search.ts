import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { useHostEventaInvoke } from '@proj-airi/stage-host-context'
import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'

import { airiMcpReadConfigText } from '../../../shared/eventa'
import { parseAiriMcpConfigText } from '../../../shared/mcp-config'

/** The marker of a saved server's row. The page and its module share it. */
export function mcpServerSearchKey(identifier: string) {
  return settingsSearchItemKey('mcp-server', identifier)
}

/** The MCP page, with the saved servers by name, from the config file that the page edits. */
export default {
  routes: [{
    path: '/settings/modules/mcp',
    items: async () => {
      const { text } = await useHostEventaInvoke(airiMcpReadConfigText)()
      return Object.keys(parseAiriMcpConfigText(text).mcpServers)
        .map(identifier => ({ title: identifier, key: mcpServerSearchKey(identifier) }))
    },
  }],
} satisfies SettingsSearchModule
