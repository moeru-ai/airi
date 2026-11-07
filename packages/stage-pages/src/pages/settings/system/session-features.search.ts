import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { SESSION_DEFAULT_PREFERENCES } from '@proj-airi/stage-ui/stores/chat/features-store'

/** Only defaults owned by this page appear in its search results. */
export default {
  routes: [{
    path: '/settings/system/session-features',
    items: ({ t }) => SESSION_DEFAULT_PREFERENCES.map(key => ({ title: t(`settings.session-features.features.${key}.label`), key })),
  }],
} satisfies SettingsSearchModule
