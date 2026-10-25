/**
 * The contract between the settings search index, the pages, and the settings layout.
 *
 * The build-time scan in `@proj-airi/stage-pages/vite/settings-search` writes the index and marks the rows.
 * The settings search in stage-ui reads the index and opens a row.
 * This module has no runtime dependencies, so both sides can import it.
 */

/**
 * The query parameter that names the setting to show after a search opens its page.
 * It repeats when one result stands for several settings with the same name, such as "Scale" of each model type.
 */
export const SETTINGS_SEARCH_QUERY = 'setting'

/**
 * The query parameter that names the row to show when the setting is not on the page, such as the card of the provider
 * that lists a model. Static settings keep their gates in the route meta instead.
 */
export const SETTINGS_SEARCH_GATE_QUERY = 'setting-gate'

/**
 * The attribute that marks the row of a searchable setting.
 * Its value is a key, or several keys separated by spaces, as in `class`. A key never has a space:
 * an i18n key has none, and {@link settingsSearchItemKey} encodes the parts of a runtime key.
 */
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

/**
 * Builds the marker of a runtime item from its kind and its parts, such as a card id and a wake word.
 *
 * Use when:
 * - A provider and its page need the same marker for an item.
 *
 * Returns:
 * - `kind:part:part`, with each part URI-encoded. The marker has no spaces, so a name such as "Hey AIRI" stays one key
 *   in {@link SETTINGS_SEARCH_ATTRIBUTE}.
 */
export function settingsSearchItemKey(kind: string, ...parts: string[]) {
  return [kind, ...parts.map(part => encodeURIComponent(part))].join(':')
}

/** The settings that a search result shows on its page. */
export interface SettingsSearchTarget {
  /** The keys of the setting. The page highlights the first one that it shows. */
  keys: string[]
  /** The rows to show when no key is on the page, nearest first. */
  gates?: string[]
}

/** The address of a page that shows the target. Each key and gate is a query parameter of its own. */
export function settingsSearchLocation(path: string, target: SettingsSearchTarget) {
  const params = new URLSearchParams()
  for (const key of target.keys)
    params.append(SETTINGS_SEARCH_QUERY, key)
  for (const gate of target.gates ?? [])
    params.append(SETTINGS_SEARCH_GATE_QUERY, gate)
  return `${path}?${params}`
}

/** The target that a route query names. A page without a search target has no keys. */
export function settingsSearchTargetOf(query: Readonly<Record<string, unknown>>): Required<SettingsSearchTarget> {
  const valuesOf = (value: unknown) => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string' && item !== '')
  return { keys: valuesOf(query[SETTINGS_SEARCH_QUERY]), gates: valuesOf(query[SETTINGS_SEARCH_GATE_QUERY]) }
}

/** One runtime item, such as a character card or an MCP server, that a settings page lists. */
export interface SettingsSearchItem {
  /** The name that a person searches for, such as the card name. */
  title: string
  /** Where on the page the item is, when the page lists it in more than one place, such as "Recently deleted". */
  section?: string
  /** The marker of the item's row on the page. The row binds the same value to {@link SETTINGS_SEARCH_ATTRIBUTE}. */
  key: string
  /**
   * The markers of the rows to show when the item's row is not on the page, nearest first.
   * For example, a voice that shows only under some models names those model cards, then the card of its provider.
   */
  gates?: string[]
  /** A page that shows the item itself, such as the page of one card. Without it, the result opens the listing page at the row. */
  to?: string
}

/**
 * The export that the build-time scan adds to a provider view, such as the Hearing controls of a transcription provider.
 * A page renders such a view by provider at runtime, so its own scan cannot reach it. The view lists its settings instead.
 */
export const SETTINGS_SEARCH_VIEW_EXPORT = 'settingsSearchEntries'

/** A setting of a provider view: its i18n key, and the rows to show when it is not on the page, nearest first. */
export interface SettingsSearchViewEntry {
  key: string
  gates: string[]
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
