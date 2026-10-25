import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** The marker of a wake word's block. A word is unique for each card. */
export function wakeWordSearchKey(cardId: string, text: string) {
  return settingsSearchItemKey('wake-word', cardId, text)
}

/** Lists the wake words of every card, with the card that answers each one, as the page groups them. */
const provideWakeWords: SettingsSearchProvider = () =>
  [...useAiriCardStore().cards].flatMap(([id, card]) =>
    (card.extensions.airi.wakeWords ?? []).map(word => ({ title: word.text, key: wakeWordSearchKey(id, word.text), section: card.name })))

export default provideWakeWords
