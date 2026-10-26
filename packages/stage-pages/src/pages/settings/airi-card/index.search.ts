import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** Lists the character cards. A result opens the page of the card. */
const provideCards: SettingsSearchProvider = () => {
  const cardStore = useAiriCardStore()
  return [...cardStore.cards.entries()].map(([id, card]) => ({
    title: card.name,
    key: settingsSearchItemKey('card', id),
    to: `/settings/airi-card/${id}`,
  }))
}

export default provideCards
