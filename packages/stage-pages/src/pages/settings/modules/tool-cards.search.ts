import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useToolCardsStore } from '@proj-airi/stage-ui/stores/tool-cards'

/** The marker of a card's row. The page and its module share it. */
export function toolCardSearchKey(key: string) {
  return settingsSearchItemKey('tool-card', key)
}

/** The tool cards page, with the saved cards by the tool that each one shows. */
export default {
  routes: [{
    path: '/settings/modules/tool-cards',
    items: () => useToolCardsStore().cards.map(card => ({ title: card.key, key: toolCardSearchKey(card.key) })),
  }],
} satisfies SettingsSearchModule
