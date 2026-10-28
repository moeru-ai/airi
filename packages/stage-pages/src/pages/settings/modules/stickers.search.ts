import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { stickerDisplayName, stickerSearchKey, useStickersStore } from '@proj-airi/stage-ui/stores/modules/stickers'

/** The stickers page, with the stickers by the names that the page shows. The custom ones load from IndexedDB first. */
export default {
  routes: [{
    path: '/settings/modules/stickers',
    items: async ({ t }) => {
      const stickers = useStickersStore()
      await stickers.load()
      return stickers.entries.map(entry => ({ title: stickerDisplayName(entry, t), key: stickerSearchKey(entry.id) }))
    },
  }],
} satisfies SettingsSearchModule
