import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** The character cards page, with each card. A result of a card opens the page of the card. */
export default {
  routes: [{
    path: '/settings/airi-card',
    items: () => [...useAiriCardStore().cards.entries()].map(([id, card]) => ({
      title: card.name,
      key: settingsSearchItemKey('card', id),
      to: `/settings/airi-card/${id}`,
    })),
  }],
} satisfies SettingsSearchModule
