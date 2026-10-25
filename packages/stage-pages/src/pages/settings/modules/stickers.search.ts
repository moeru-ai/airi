import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { stickerDisplayName, stickerSearchKey, useStickersStore } from '@proj-airi/stage-ui/stores/modules/stickers'

/** Lists the stickers by the names that the page shows. The custom ones load from IndexedDB first. */
const provideStickers: SettingsSearchProvider = async ({ t }) => {
  const stickers = useStickersStore()
  await stickers.load()
  return stickers.entries.map(entry => ({ title: stickerDisplayName(entry, t), key: stickerSearchKey(entry.id) }))
}

export default provideStickers
