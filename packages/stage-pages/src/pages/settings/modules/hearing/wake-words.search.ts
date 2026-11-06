import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** The marker of a wake word's block. A word is unique for each card. */
export function wakeWordSearchKey(cardId: string, text: string) {
  return settingsSearchItemKey('wake-word', cardId, text)
}

/** The wake words page, with the words of every card and the card that answers each one, as the page groups them. */
export default {
  routes: [{
    path: '/settings/modules/hearing/wake-words',
    items: () => [...useAiriCardStore().cards].flatMap(([id, card]) =>
      (card.extensions.airi.wakeWords ?? []).map(word => ({ title: word.text, key: wakeWordSearchKey(id, word.text), section: card.name }))),
  }],
} satisfies SettingsSearchModule
