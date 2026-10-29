import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'
import type { MemoryEntry } from '@proj-airi/stage-ui/types/memory'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** The marker of a memory's row. General memories have no card. */
export function memorySearchKey(entry: MemoryEntry) {
  return settingsSearchItemKey('memory', entry.persona ?? '', entry.id)
}

/** The memories page, with each remembered fact and the card that keeps it, as the page groups them. */
export default {
  routes: [{
    path: '/settings/modules/memory-long-term-memories',
    items: ({ t }) => {
      const cards = useAiriCardStore().cards
      return useMemoryStore().entries.map(entry => ({
        title: entry.description || entry.body,
        key: memorySearchKey(entry),
        section: entry.persona
          ? cards.get(entry.persona)?.name || entry.persona
          : t('settings.pages.modules.memory-long-term.memories.general'),
      }))
    },
  }],
} satisfies SettingsSearchModule
