import type { SettingsSearchContext, SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { errorMessageFrom } from '@moeru/std'
import { shallowRef } from 'vue'

/** A settings route that a module holds. */
export interface SettingsSearchRoute {
  /**
   * The route path, such as `/settings/modules/mcp`.
   * The module also holds the routes below it, unless another module names one of them.
   */
  path: string
  /** Lists the runtime items that the page shows, such as the saved MCP servers. */
  items?: SettingsSearchProvider
  /**
   * Settings of the page that search lists only while their condition holds, by i18n key.
   * For example, a row that a feature flag adds to a page.
   */
  conditions?: Readonly<Record<string, () => boolean>>
}

/** A page that runtime data names, such as the settings of one provider. */
export interface SettingsSearchPage {
  /** The address that the result opens. Search also lists the settings that the build-time scan found on its route. */
  to: string
  title: string
  /** Where the parent page lists the page, such as "Chat" on the providers page. */
  section?: string
}

/** What one module adds to the settings search. */
export interface SettingsSearchModule {
  /**
   * Whether the module is on, such as a feature behind a feature flag or a cloud policy.
   * While it returns false, search lists none of the routes, pages, settings, or items of the module.
   * Search reads it again whenever its results change, so a change of the flag shows in the next results.
   */
  when?: () => boolean
  /** The settings routes of the module. A plain string holds a route without items or conditions. */
  routes?: readonly (string | SettingsSearchRoute)[]
  /** Lists pages that no route names by itself, such as one page for each provider. */
  pages?: (context: SettingsSearchContext) => readonly SettingsSearchPage[]
}

/**
 * A module, or a loader that imports it, such as `() => import('./mcp.search')`.
 * A loader keeps the module and the stores that its items read out of the startup chunk. The settings home loads it.
 */
export type SettingsSearchModuleSource = SettingsSearchModule | (() => Promise<{ default: SettingsSearchModule }>)

/** The route entry that holds a path. */
export interface SettingsSearchRouteOwner {
  route: SettingsSearchRoute
  /** Whether the entry names the path itself. Only then do its items and its conditions belong to the path. */
  exact: boolean
  /** Whether every module that holds the path, or a route above it, is on. */
  active: boolean
}

/**
 * The modules that make up the settings search.
 *
 * Each module holds its settings routes and its runtime items, and tells whether it is on. The build-time scan only reads
 * facts from the templates. This registry decides what search lists.
 *
 * Use when:
 * - An app starts. It provides each module that it ships, as it provides services to injeca, before a settings home mounts.
 *
 * Expects:
 * - A route that no module holds is not in the search. In development, the settings home reports such routes.
 */
export class SettingsSearchRegistry {
  /** The provided sources by name, in the order that the app provided them. */
  private readonly sources = new Map<string, SettingsSearchModuleSource>()
  /** Modules that loaded, by name. A loader that fails stays out, and the other modules still load. */
  private readonly resolved = new Map<string, SettingsSearchModule>()
  /**
   * The loaded modules in the order of {@link sources}, not in the order that their chunks arrive, so the results keep their order.
   * It is reactive, so the search lists a lazy module as soon as it loads.
   */
  private readonly loaded = shallowRef<ReadonlyMap<string, SettingsSearchModule>>(new Map())
  /** The running load. A provide starts the next load, so a module provided late also loads. */
  private loading: Promise<void> | undefined

  /**
   * Adds a module under a name. Each name can be provided once.
   * An app that replaces a page of a shared package provides its own module under the name of the shared one instead.
   *
   * Returns:
   * - A function that removes the module.
   */
  provide(name: string, source: SettingsSearchModuleSource): () => void {
    if (this.sources.has(name))
      throw new Error(`Settings search module "${name}" is provided more than once.`)

    this.sources.set(name, source)
    this.loading = undefined
    if (typeof source !== 'function')
      this.resolve(name, source)

    return () => {
      if (this.sources.get(name) !== source)
        return
      this.sources.delete(name)
      this.resolved.delete(name)
      this.publish()
    }
  }

  /** Loads each module that has not loaded. Calls share one load until another module is provided. */
  load(): Promise<void> {
    this.loading ??= Promise.all([...this.sources].map(async ([name, source]) => {
      if (typeof source !== 'function' || this.resolved.has(name))
        return
      try {
        const { default: module } = await source()
        // The module can be removed while its chunk loads.
        if (this.sources.get(name) === source)
          this.resolve(name, module)
      }
      catch (error) {
        console.warn(`[settings search] The module ${name} did not load:`, errorMessageFrom(error) ?? error)
      }
    })).then(() => undefined)
    return this.loading
  }

  /** The loaded modules, in the order that the app provided them. */
  get modules(): ReadonlyMap<string, SettingsSearchModule> {
    return this.loaded.value
  }

  /** Whether a module is on. A module without a condition is always on. */
  isActive(module: SettingsSearchModule) {
    return module.when?.() ?? true
  }

  /**
   * Finds the route entry that holds a path: the entry with the longest path that is the path itself or a route above it.
   * A module that holds a route above the path still decides if the path is on. For example, a feature that is off removes
   * its subpages, even when another module lists their items.
   *
   * Returns:
   * - The entry, or `undefined` when no loaded module holds the path.
   */
  ownerOf(path: string): SettingsSearchRouteOwner | undefined {
    let owner: SettingsSearchRoute | undefined
    let active = true
    for (const module of this.loaded.value.values()) {
      for (const entry of module.routes ?? []) {
        const route = typeof entry === 'string' ? { path: entry } : entry
        if (path !== route.path && !path.startsWith(`${route.path}/`))
          continue
        active &&= this.isActive(module)
        if (!owner || route.path.length > owner.path.length)
          owner = route
      }
    }
    return owner && { route: owner, exact: owner.path === path, active }
  }

  private resolve(name: string, module: SettingsSearchModule) {
    this.resolved.set(name, module)
    this.publish()
  }

  private publish() {
    this.loaded.value = new Map([...this.sources.keys()].flatMap((name) => {
      const module = this.resolved.get(name)
      return module ? [[name, module] as const] : []
    }))
  }
}

/** The settings search registry of the app. Each app fills it at startup. */
export const settingsSearch = new SettingsSearchRegistry()
