import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'
import type { SyncCategory } from '@proj-airi/stage-ui/stores/sync-preferences'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { syncCategories } from '@proj-airi/stage-ui/stores/sync-preferences'
import { snakeCase } from 'es-toolkit'

/** The marker of a sync switch. The sync section and this module share it. */
export function syncSearchKey(category: SyncCategory) {
  return settingsSearchItemKey('sync', category)
}

/** The i18n key prefix of a sync switch, for example `settings.pages.account.sync.items.character_cards`. */
export function syncItemKey(category: SyncCategory) {
  return `settings.pages.account.sync.items.${snakeCase(category)}`
}

/** The account page, with its sync switches by their titles. */
export default {
  routes: [{
    path: '/settings/account',
    items: ({ t }) => syncCategories.map(category => ({ title: t(`${syncItemKey(category)}.title`), key: syncSearchKey(category) })),
  }],
} satisfies SettingsSearchModule
