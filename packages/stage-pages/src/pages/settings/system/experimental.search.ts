import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'

/** The marker of an experiment's row. The page and its module share it. */
export function experimentSearchKey(key: string) {
  return settingsSearchItemKey('experiment', key)
}

/** The experimental features page, with the experiments that it offers by their titles. */
export default {
  routes: [{
    path: '/settings/system/experimental',
    items: ({ t }) => useFeatureFlagsStore().features.map(feature => ({ title: t(feature.titleKey), key: experimentSearchKey(feature.key) })),
  }],
} satisfies SettingsSearchModule
