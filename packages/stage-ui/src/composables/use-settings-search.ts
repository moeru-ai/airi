import type { SettingsSearchItem, SettingsSearchProvider, SettingsSearchRouteMeta } from '@proj-airi/stage-shared/settings-search'
import type { MaybeRefOrGetter } from 'vue'
import type { Router } from 'vue-router'

import { errorMessageFrom } from '@moeru/std'
import { SETTINGS_SEARCH_ATTRIBUTE, settingsSearchLocation, settingsSearchTargetOf } from '@proj-airi/stage-shared/settings-search'
import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { settingsSearch } from '../libs/settings-search'

/** The top-level settings page that holds a search result, such as "Modules". */
export interface SettingsSearchCategory {
  title: string
  icon?: string
}

/** A page or a setting that a settings search can open. */
export interface SettingsSearchResult {
  /** The name of the page or the setting. */
  title: string
  /** The top-level page that holds the result. A top-level page is its own category. */
  category: SettingsSearchCategory
  /** The pages and the section between the category and the result, from the top. */
  location: string[]
  to: string
}

/** A settings page in the search index. */
interface SearchPage {
  title: string
  /** The titles of the pages above this page, from the top. The first one is the category. */
  location: string[]
  category: SettingsSearchCategory
  searchKeys: string[]
}

const SETTINGS_ROOT = '/settings'
/** A page can render its rows after async data loads. Stop waiting for the row after this time. */
const REVEAL_TIMEOUT_MS = 3000
/** When the page stops changing for this long and the row is still missing, the current state hides it. */
const REVEAL_QUIET_MS = 600
/** A page can render its rows again, such as after it reloads a list. The highlight follows the new row for this long. */
const REVEAL_FOLLOW_MS = 10000
/** Any of these inputs means that the person took over the page, so the search stops moving it. */
const TAKE_OVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
/** How long the row keeps its highlight before it fades out. */
const HIGHLIGHT_MS = 1600
/** The highlight is an outline like the focus outline of AIRI buttons. It keeps the surface of the row. */
const HIGHLIGHT_CLASSES = ['outline-2', 'outline-solid']
/** The outline sits outside the row when it fits there, and inside the row when a parent would cut it. */
const HIGHLIGHT_OUTSIDE_CLASS = 'outline-offset-4'
const HIGHLIGHT_INSIDE_CLASS = '-outline-offset-2'
/** The room that the outline takes outside the row: its offset and its width, in pixels. */
const HIGHLIGHT_OUTSIDE_ROOM = 6
const HIGHLIGHT_COLOR_CLASS = 'outline-primary-400/60'
/** The outline fades to transparent. Its style must stay solid until then, because a style change does not animate. */
const HIGHLIGHT_FADE_CLASSES = ['transition-[outline-color]', 'duration-500']
const HIGHLIGHT_FADE_MS = 500
const HIGHLIGHT_FADED_CLASS = 'outline-transparent'
/** A row without its own corners gets these, so the outline is not square. A card keeps its corners. */
const HIGHLIGHT_CORNER_CLASSES = ['rounded-lg']

/** The development report of routes that no module holds runs once in each window, not once for each settings home. */
let coverageReported = false

/** The settings routes that search can list by themselves: routes with a title and without parameters. */
function settingsRoutesOf(router: Router) {
  return router.getRoutes().filter((route) => {
    const meta = route.meta as SettingsSearchRouteMeta
    return route.path.startsWith(`${SETTINGS_ROOT}/`) && !route.path.includes(':') && Boolean(meta.titleKey || meta.title)
  })
}

/**
 * Reports, in development, the settings routes that search cannot list as they are:
 * - routes that no module holds, so they are not in the search at all;
 * - routes whose page marks rows of runtime items, while the module that holds the route lists no items for it.
 */
function reportCoverage(router: Router) {
  const unheld: string[] = []
  const withoutItems: string[] = []
  for (const route of settingsRoutesOf(router)) {
    const owner = settingsSearch.ownerOf(route.path)
    if (!owner)
      unheld.push(route.path)
    else if ((route.meta as SettingsSearchRouteMeta).searchItemRows && (!owner.exact || !owner.route.items))
      withoutItems.push(route.path)
  }
  if (unheld.length)
    console.warn(`[settings search] No module holds these settings routes, so search does not list them. Provide a module that names them:\n${unheld.map(path => `  ${path}`).join('\n')}`)
  if (withoutItems.length)
    console.warn(`[settings search] These pages mark rows of runtime items, but their module lists no items. Add \`items\` to the route of the module:\n${withoutItems.map(path => `  ${path}`).join('\n')}`)
}

/**
 * Finds settings pages, the settings on them, and runtime items by name.
 *
 * Use when:
 * - The settings home filters its list as the user types.
 *
 * Expects:
 * - The app provided its modules to {@link settingsSearch}. Only the routes, pages, and items of a module that is on are in the results.
 * - Settings routes keep their titles in route meta, as the settings layout reads them.
 * - The build-time scan in `@proj-airi/stage-pages/vite/settings-search` wrote `searchKeys` into the route meta.
 *
 * Returns:
 * - The results in index order, with titles that start with the query first. An empty query returns no results.
 *   The search lists the items of a module each time a person starts to search, so the items are fresh.
 */
export function useSettingsSearch(query: MaybeRefOrGetter<string>) {
  const router = useRouter()
  const { t } = useI18n()

  // The modules load when the settings home opens, so the pages are ready when the person starts to type.
  void settingsSearch.load().then(() => {
    if (import.meta.env.DEV && !coverageReported) {
      coverageReported = true
      reportCoverage(router)
    }
  })

  const searching = computed(() => toValue(query).trim() !== '')

  /** The item lists of the routes of the modules that are on, by route path. A module that turns on during a search adds its list. */
  const itemSources = computed(() => {
    const sources: Array<[string, SettingsSearchProvider]> = []
    for (const module of settingsSearch.modules.values()) {
      for (const route of module.routes ?? []) {
        if (typeof route !== 'string' && route.items && settingsSearch.ownerOf(route.path)?.active)
          sources.push([route.path, route.items])
      }
    }
    return sources
  })

  /** The runtime items of each page, by route path. The items of the last search stay until the new ones arrive. */
  const itemsByPath = shallowRef<ReadonlyMap<string, SettingsSearchItem[]>>(new Map())
  /** Each search lists the items again. A list from an earlier search that arrives late is dropped. */
  let loadGeneration = 0
  /** The routes whose items this search asked for, so a module that turns on adds its list once. */
  const requested = new Set<string>()

  /** Lists the items of one route. Each page's items show as soon as they arrive, so a slow catalog does not hold back the cards. */
  function loadItems(path: string, provide: SettingsSearchProvider) {
    if (requested.has(path))
      return
    requested.add(path)
    const generation = loadGeneration
    void (async () => {
      try {
        const loaded = await provide({ t })
        if (generation === loadGeneration)
          itemsByPath.value = new Map([...itemsByPath.value, [path, loaded]])
      }
      catch (error) {
        // One failing list, such as an offline model catalog, must not hide the other results.
        console.warn(`[settings search] The items of ${path} did not load:`, errorMessageFrom(error) ?? error)
      }
    })()
  }

  watch([searching, itemSources], ([isSearching, sources], previous) => {
    if (!isSearching)
      return
    if (!previous?.[0]) {
      loadGeneration++
      requested.clear()
    }
    for (const [path, provide] of sources)
      loadItems(path, provide)
  }, { immediate: true })

  const index = computed<SettingsSearchResult[]>(() => {
    // Every titled settings route, whether search lists it or not. The titles of the routes above a page make its location.
    // Routes with parameters, such as one card, need data that a route does not have. Modules name those pages or items themselves.
    const pages = new Map<string, SearchPage>()
    for (const route of settingsRoutesOf(router)) {
      const meta = route.meta as SettingsSearchRouteMeta
      const title = meta.titleKey ? t(meta.titleKey) : meta.title ?? ''
      pages.set(route.path, {
        title,
        location: [],
        category: { title, icon: meta.icon },
        searchKeys: meta.searchKeys ?? [],
      })
    }

    /** The titled pages on a path, from the top, without the page at the path itself. */
    const ancestorsOf = (path: string) => {
      const segments = path.slice(SETTINGS_ROOT.length + 1).split('/')
      return segments.slice(0, -1)
        .map((_, end) => pages.get(`${SETTINGS_ROOT}/${segments.slice(0, end + 1).join('/')}`))
        .filter(ancestor => ancestor !== undefined)
    }

    // The location of a page is the titled pages on its path, from the top. The top one is its category.
    for (const [path, page] of pages) {
      const ancestors = ancestorsOf(path)
      page.location = ancestors.map(ancestor => ancestor.title)
      page.category = ancestors[0]?.category ?? page.category
    }

    // A route is in the results only while the modules that hold it are on. A key with a condition of its route also needs the condition.
    const routePages: Array<[string, SearchPage]> = []
    for (const [path, page] of pages) {
      const owner = settingsSearch.ownerOf(path)
      if (!owner?.active)
        continue
      const conditions = owner.exact ? owner.route.conditions : undefined
      routePages.push([path, conditions ? { ...page, searchKeys: page.searchKeys.filter(key => conditions[key]?.() ?? true) } : page])
    }

    // Pages that a module names from runtime data, such as one page for each provider.
    const modulePages: Array<[string, SearchPage]> = []
    for (const module of settingsSearch.modules.values()) {
      if (!settingsSearch.isActive(module))
        continue
      for (const page of module.pages?.({ t }) ?? []) {
        // A page under a route of a module that is off is off too.
        if (settingsSearch.ownerOf(page.to)?.active === false)
          continue
        // A page can be another name for a route that has its own result, such as a provider whose settings sit on a module page.
        // It is a result under that route, and the route keeps the settings.
        const routePage = pages.get(page.to)
        if (routePage) {
          modulePages.push([page.to, {
            title: page.title,
            location: [...routePage.location, routePage.title],
            category: routePage.category,
            searchKeys: [],
          }])
          continue
        }
        // Another page has its settings on the route that its address resolves to, such as the route of a provider with a parameter.
        const ancestors = ancestorsOf(page.to)
        const meta = router.resolve(page.to).matched.at(-1)?.meta as SettingsSearchRouteMeta | undefined
        modulePages.push([page.to, {
          title: page.title,
          location: [...ancestors.map(ancestor => ancestor.title), ...(page.section ? [page.section] : [])],
          category: ancestors[0]?.category ?? { title: page.title },
          searchKeys: meta?.searchKeys ?? [],
        }])
      }
    }
    const modulePageByPath = new Map(modulePages.toReversed())

    const results: SettingsSearchResult[] = []
    // A location starts with the category. The result names the category apart, so its location is what comes after it.
    const below = (titles: string[]) => titles.slice(1)
    // A runtime item opens its own page, or the listing page at its row. Its location is the page that lists it.
    for (const [path, pathItems] of itemsByPath.value) {
      // The module of the route can turn off after its items loaded.
      if (!settingsSearch.ownerOf(path)?.active)
        continue
      for (const item of pathItems) {
        const itemPath = (item.to ?? '').split('?')[0]
        const listing = pages.get(path) ?? pages.get(itemPath) ?? modulePageByPath.get(itemPath)
        if (!listing)
          continue
        results.push({
          title: item.title,
          category: listing.category,
          location: below([...listing.location, listing.title, ...(item.section ? [item.section] : [])]),
          to: item.to ?? settingsSearchLocation(path, { keys: [item.key], gates: item.gates }),
        })
      }
    }
    for (const [path, page] of [...routePages, ...modulePages]) {
      results.push({
        title: page.title,
        category: page.category,
        location: below(page.location),
        to: path,
      })
      // A section and its switch often share a name, such as "Microphone", and each model type has its own "Scale".
      // One result per name and page lists all those keys, so the page highlights whichever one it shows.
      const keysByTitle = new Map<string, string[]>()
      for (const key of page.searchKeys) {
        const title = t(key)
        if (title !== page.title)
          keysByTitle.set(title, [...keysByTitle.get(title) ?? [], key])
      }
      for (const [title, keys] of keysByTitle) {
        results.push({
          title,
          category: page.category,
          location: below([...page.location, page.title]),
          to: settingsSearchLocation(path, { keys }),
        })
      }
    }
    // The same name at the same place can come twice, such as a provider page and the provider's card on that page.
    // Runtime items come first, so the result that points to a row stays.
    const seen = new Set<string>()
    return results.filter((result) => {
      const key = [result.to.split('?')[0], result.title, result.category.title, ...result.location].join('\n')
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
  })

  return computed(() => {
    const needle = toValue(query).trim().toLocaleLowerCase()
    if (!needle)
      return []

    const hits = index.value.filter(result => result.title.toLocaleLowerCase().includes(needle))
    return [
      ...hits.filter(result => result.title.toLocaleLowerCase().startsWith(needle)),
      ...hits.filter(result => !result.title.toLocaleLowerCase().startsWith(needle)),
    ]
  })
}

/**
 * The settings that the current search result names on this page.
 *
 * Use when:
 * - A page renders only part of a long list, such as a batch of devices. It brings the named row into the rendered part.
 *
 * Returns:
 * - The keys and the gates of the route query. Both are empty when the page did not open from a search.
 */
export function useSettingsSearchTarget() {
  const route = useRoute()
  return computed(() => settingsSearchTargetOf(route.query))
}

/**
 * Scrolls to the setting that a search result names, then highlights its row.
 *
 * Use when:
 * - A settings layout owns the scroll container of its pages.
 *
 * Expects:
 * - The route query names the keys of the setting in `setting` parameters, one key in each.
 *   `setting-gate` parameters can name the rows to show when the setting is not on the page, such as a provider card.
 * - The build-time scan or the page marked the row with the same key in {@link SETTINGS_SEARCH_ATTRIBUTE},
 *   and the scan wrote the gate of each conditional setting into `meta.searchGates`.
 *
 * Returns:
 * - Nothing. A setting that shows only in another state is not on the page. Its gate, such as the switch that turns it on,
 *   gets the highlight instead. Without a gate, such as a setting of another model type, a toast says so.
 * - When the page renders the row again, such as after it reloads a list, the highlight moves to the new row.
 *   It stops when the person scrolls, clicks, or types.
 */
export function useSettingsSearchReveal(container: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const route = useRoute()
  const target = useSettingsSearchTarget()
  const { t } = useI18n()
  let stopWaiting: (() => void) | undefined

  /**
   * Whether the outline fits outside the row. A parent that clips its content, such as a horizontal strip of cards,
   * cuts an outline that reaches past the edges of its content. The check uses positions in the content of each parent,
   * so it does not depend on where the parent is scrolled.
   */
  function outlineFitsOutside(row: HTMLElement, root: HTMLElement) {
    const rect = row.getBoundingClientRect()
    for (let parent = row.parentElement; parent && parent !== root.parentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      if (style.overflowX === 'visible' && style.overflowY === 'visible')
        continue
      const box = parent.getBoundingClientRect()
      const left = rect.left - box.left - parent.clientLeft + parent.scrollLeft
      const top = rect.top - box.top - parent.clientTop + parent.scrollTop
      if (left < HIGHLIGHT_OUTSIDE_ROOM || top < HIGHLIGHT_OUTSIDE_ROOM
        || left + rect.width + HIGHLIGHT_OUTSIDE_ROOM > parent.scrollWidth
        || top + rect.height + HIGHLIGHT_OUTSIDE_ROOM > parent.scrollHeight) {
        return false
      }
    }
    return true
  }

  function highlight(row: HTMLElement, root: HTMLElement) {
    // `inline` centers a row of a horizontal strip too, such as a collapsed list of voice cards.
    row.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    const corners = getComputedStyle(row).borderRadius === '0px' ? HIGHLIGHT_CORNER_CLASSES : []
    const offset = outlineFitsOutside(row, root) ? HIGHLIGHT_OUTSIDE_CLASS : HIGHLIGHT_INSIDE_CLASS
    const added = [...corners, ...HIGHLIGHT_CLASSES, offset, HIGHLIGHT_COLOR_CLASS]
    row.classList.add(...added)
    setTimeout(() => {
      row.classList.add(...HIGHLIGHT_FADE_CLASSES)
      // The transition must apply before the color changes, or the outline disappears at once.
      requestAnimationFrame(() => row.classList.replace(HIGHLIGHT_COLOR_CLASS, HIGHLIGHT_FADED_CLASS))
      setTimeout(() => row.classList.remove(...added, ...HIGHLIGHT_FADE_CLASSES, HIGHLIGHT_FADED_CLASS), HIGHLIGHT_FADE_MS + 100)
    }, HIGHLIGHT_MS)
  }

  /** The gates of the keys, nearest first. A gate can have its own gate, such as a switch inside another section. */
  function gatesOf(keys: string[], gates: Readonly<Record<string, string>>) {
    const found: string[] = []
    for (const key of keys) {
      let gate = gates[key]
      while (gate && !found.includes(gate)) {
        found.push(gate)
        gate = gates[gate]
      }
    }
    return found
  }

  // The layout resets the scroll position after a path change. This watcher runs after it, in the same flush.
  // The container is a source too, so a window that opens on a search link still finds the row after mount.
  watch(() => [route.path, target.value, toValue(container)] as const, ([, { keys, gates }, root]) => {
    stopWaiting?.()
    // Settings with the same name, such as "Scale" of each model type, share one result. The page shows one of them.
    if (!keys.length || !root)
      return

    const meta = route.matched.at(-1)?.meta as SettingsSearchRouteMeta | undefined
    const gateKeys = [...new Set([...gates, ...gatesOf([...keys, ...gates], meta?.searchGates ?? {})])]
    const findAny = (candidates: string[]) => {
      for (const key of candidates) {
        const row = root.querySelector<HTMLElement>(`[${SETTINGS_SEARCH_ATTRIBUTE}~="${CSS.escape(key)}"]`)
        if (row)
          return row
      }
      return null
    }

    // The row that has the highlight. When the page renders its rows again, the highlight moves to the new row.
    let shownRow: HTMLElement | undefined
    const showRow = (row: HTMLElement) => {
      shownRow = row
      highlight(row, root)
    }

    let gateShown = false
    let quiet: ReturnType<typeof setTimeout> | undefined
    const opened = new Set<HTMLElement>()
    // When the row is missing, the nearest gate on the page decides the next step. A collapsed section opens, because that changes
    // only the view, and the search waits for the row again. Any other gate, such as a switch, only gets the highlight:
    // search never changes a setting.
    const settle = () => {
      if (shownRow)
        return
      for (const key of gateKeys) {
        const gate = findAny([key])
        if (!gate)
          continue
        const trigger = gate.matches('[aria-expanded]') ? gate : gate.querySelector<HTMLElement>('[aria-expanded]')
        if (trigger?.getAttribute('aria-expanded') === 'false' && !opened.has(trigger)) {
          opened.add(trigger)
          trigger.click()
          return
        }
        if (!gateShown) {
          gateShown = true
          highlight(gate, root)
        }
        return
      }
    }
    const observer = new MutationObserver(() => {
      if (shownRow?.isConnected)
        return
      // The row appeared, such as after its data loaded, or the page rendered it again.
      const found = findAny(keys)
      if (found) {
        showRow(found)
        return
      }
      // A shown row that went away comes back with the list. The gates are only for a row that the page has not shown.
      if (shownRow)
        return
      // The page stopped changing and the setting is still missing, so the current state hides it.
      clearTimeout(quiet)
      quiet = setTimeout(settle, REVEAL_QUIET_MS)
    })

    const row = findAny(keys)
    if (row)
      showRow(row)
    else
      quiet = setTimeout(settle, REVEAL_QUIET_MS)
    const timeout = setTimeout(() => {
      if (shownRow)
        return
      const gate = findAny(gateKeys)
      if (gate && !gateShown) {
        gateShown = true
        highlight(gate, root)
      }
      else if (!gate) {
        toast.info(t('settings.search.not-shown', { name: t(keys[0] ?? '') }))
      }
    }, REVEAL_TIMEOUT_MS)
    // The search stops following after a while, or as soon as the person scrolls, clicks, or types.
    const follow = setTimeout(() => stopWaiting?.(), REVEAL_FOLLOW_MS)
    const takeOver = () => stopWaiting?.()
    TAKE_OVER_EVENTS.forEach(type => root.addEventListener(type, takeOver, { passive: true }))
    observer.observe(root, { childList: true, subtree: true })
    stopWaiting = () => {
      observer.disconnect()
      clearTimeout(timeout)
      clearTimeout(quiet)
      clearTimeout(follow)
      TAKE_OVER_EVENTS.forEach(type => root.removeEventListener(type, takeOver))
      stopWaiting = undefined
    }
  }, { flush: 'post', immediate: true })

  onScopeDispose(() => stopWaiting?.())
}
