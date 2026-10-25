/**
 * The contract between the settings search index, the pages, and the settings layout.
 *
 * The build-time scan in `@proj-airi/stage-pages/vite/settings-search` writes the index and marks the rows.
 * The settings search in stage-ui reads the index and opens a row.
 * This module has no runtime dependencies, so both sides can import it.
 */

/** The query parameter that names the setting to show after a search opens its page. */
export const SETTINGS_SEARCH_QUERY = 'setting'

/** The attribute that marks the row of a searchable setting. Its value is the i18n key of the label, or several keys separated by spaces. */
export const SETTINGS_SEARCH_ATTRIBUTE = 'data-settings-search'

/** Route meta fields that the settings search reads. */
export interface SettingsSearchRouteMeta {
  titleKey?: string
  title?: string
  descriptionKey?: string
  description?: string
  icon?: string
  /** The i18n keys of the settings on the page. The build-time scan writes them. */
  searchKeys?: string[]
  /** For a setting that shows only in some state, the setting that controls it, such as its switch. The build-time scan writes them. */
  searchGates?: Record<string, string>
}

/** One runtime item, such as a character card or an MCP server, that a settings page lists. */
export interface SettingsSearchItem {
  /** The name that a person searches for, such as the card name. */
  title: string
  /** Where on the page the item is, when the page lists it in more than one place, such as "Recently deleted". */
  section?: string
  /** The marker of the item's row on the page. The row binds the same value to {@link SETTINGS_SEARCH_ATTRIBUTE}. */
  key: string
  /** A page that shows the item itself, such as the page of one card. Without it, the result opens the listing page at the row. */
  to?: string
}

/** What a provider gets from the search, so its names match the page. */
export interface SettingsSearchContext {
  /** Translates a key in the current locale, as the page does. */
  t: (key: string, params?: Record<string, unknown>) => string
}

/**
 * Lists the runtime items of one settings page for the search.
 *
 * A page provides it in a sibling file named `<page>.search.ts`, as the default export.
 * The search calls it when a person starts to search, so it can load data, such as a model catalog.
 */
export type SettingsSearchProvider = (context: SettingsSearchContext) => SettingsSearchItem[] | Promise<SettingsSearchItem[]>
