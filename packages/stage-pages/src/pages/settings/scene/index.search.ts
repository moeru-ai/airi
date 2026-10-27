import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores'
import { until } from '@vueuse/core'

/** The marker of a background's tile. The page and its module share it. */
export function sceneBackgroundSearchKey(id: string) {
  return settingsSearchItemKey('scene-background', id)
}

/** The gallery shows the scene backgrounds and the built-in ones, not journal images or selfies. */
export function isSceneBackground(entry: { type: string }) {
  return entry.type === 'scene' || entry.type === 'builtin'
}

/** The scene page, with the backgrounds of its gallery by title, after the store reads them from IndexedDB. */
export default {
  routes: [{
    path: '/settings/scene',
    items: async () => {
      const backgrounds = useBackgroundStore()
      await until(() => backgrounds.loading).toBe(false)
      return backgrounds.availableBackgrounds
        .filter(isSceneBackground)
        .map(background => ({ title: background.title, key: sceneBackgroundSearchKey(background.id) }))
    },
  }],
} satisfies SettingsSearchModule
