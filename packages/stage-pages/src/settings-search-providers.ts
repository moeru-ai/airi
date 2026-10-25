/// <reference path="./vite/settings-search-providers.d.ts" />

import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import providers from 'virtual:settings-search-providers'

/**
 * The loaders of the runtime item providers, by settings route path.
 *
 * Use when:
 * - A settings home passes the providers to `useSettingsSearch`.
 *
 * Expects:
 * - The app build uses `createSettingsSearch` from `@proj-airi/stage-pages/vite/settings-search`, which generates this table.
 */
export const settingsSearchProviders: Readonly<Record<string, () => Promise<SettingsSearchProvider>>> = providers
