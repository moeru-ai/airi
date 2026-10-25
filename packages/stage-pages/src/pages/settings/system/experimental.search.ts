import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'

/** The marker of an experiment's row. The page and the provider share it. */
export function experimentSearchKey(key: string) {
  return settingsSearchItemKey('experiment', key)
}

/** Lists the experiments that the page offers, by their titles. */
const provideExperiments: SettingsSearchProvider = ({ t }) =>
  useFeatureFlagsStore().features.map(feature => ({ title: t(feature.titleKey), key: experimentSearchKey(feature.key) }))

export default provideExperiments
