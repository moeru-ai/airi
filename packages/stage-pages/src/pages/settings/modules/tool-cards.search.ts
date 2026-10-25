import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useToolCardsStore } from '@proj-airi/stage-ui/stores/tool-cards'

/** The marker of a card's row. The page and the provider share it. */
export function toolCardSearchKey(key: string) {
  return settingsSearchItemKey('tool-card', key)
}

/** Lists the saved tool cards by the tool that each one shows. */
const provideToolCards: SettingsSearchProvider = () =>
  useToolCardsStore().cards.map(card => ({ title: card.key, key: toolCardSearchKey(card.key) }))

export default provideToolCards
