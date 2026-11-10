import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'

import { electronMcpReadConfigText } from '../../../../shared/eventa'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'

/** The marker of a saved server's row. The page and its module share it. */
export function mcpServerSearchKey(identifier: string) {
  return settingsSearchItemKey('mcp-server', identifier)
}

/** The MCP page, with the saved servers by name, from the config file that the page edits. */
export default {
  routes: [{
    path: '/settings/modules/mcp',
    items: async () => {
      const { text } = await useElectronEventaInvoke(electronMcpReadConfigText)()
      return Object.keys(parseElectronMcpConfigText(text).mcpServers)
        .map(identifier => ({ title: identifier, key: mcpServerSearchKey(identifier) }))
    },
  }],
} satisfies SettingsSearchModule
