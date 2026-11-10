import type { SettingsSearchViewEntry } from '@proj-airi/stage-shared/settings-search'
import type { Component } from 'vue'

/** Loads the extra controls that a Provider shows in Hearing settings. */
export type HearingProviderViewLoader = () => Promise<{ default: Component }>

/** Vue-owned views that a Provider can expose in stage-ui. */
export interface ProviderViews {
  /** Extra controls for the Hearing settings page. */
  hearing?: HearingProviderViewLoader
}

/**
 * Loads the settings that a view renders, for the settings search.
 * Import the view with `?settings-search`, such as `() => import('./hearing-settings.vue?settings-search')`.
 * The build-time scan of `@proj-airi/stage-pages/vite/settings-search` gives the list.
 */
export type ProviderViewSearchEntriesLoader = () => Promise<{ default: SettingsSearchViewEntry[] }>

/**
 * The settings of each view of a Provider, for the settings search.
 * A page renders a view by Provider at runtime, so the scan of the page cannot reach it. The module of the page reads these lists.
 */
export type ProviderViewSearchEntries = { [View in keyof ProviderViews]?: ProviderViewSearchEntriesLoader }
