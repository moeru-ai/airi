import type { SettingsSearchItem, SettingsSearchProvider, SettingsSearchRouteMeta } from '@proj-airi/stage-shared/settings-search'
import type { MaybeRefOrGetter } from 'vue'

import type { ProviderMetadata } from '../libs/providers/metadata'

import { errorMessageFrom } from '@moeru/std'
import { SETTINGS_SEARCH_ATTRIBUTE, SETTINGS_SEARCH_GATE_QUERY, SETTINGS_SEARCH_QUERY, settingsSearchLocation, settingsSearchTargetOf } from '@proj-airi/stage-shared/settings-search'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { useProviderStore } from '../stores/providers/provider'

/** A page or a setting that a settings search can open. */
export interface SettingsSearchResult {
  /** The name of the page or the setting. */
  title: string
  /** The pages above the result. A top-level page shows its own description. */
  description: string
  icon?: string
  to: string
}

/** A settings page in the search index. */
interface SearchPage {
  title: string
  /** The titles of the pages above this page, from the top. */
  location: string[]
  description: string
  icon?: string
  searchKeys: string[]
}

const SETTINGS_ROOT = '/settings'
const PROVIDERS_PAGE = '/settings/providers'
/** Joins the page titles of a location, for example "Modules › Hearing". */
const LOCATION_SEPARATOR = ' › '
/** A page can render its rows after async data loads. Stop waiting for the row after this time. */
const REVEAL_TIMEOUT_MS = 3000
/** When the page stops changing for this long and the row is still missing, the current state hides it. */
const REVEAL_QUIET_MS = 600
/** How long the row keeps its highlight before it fades out. */
const HIGHLIGHT_MS = 1600
/** The highlight is an outline like the focus outline of AIRI buttons. It keeps the surface of the row. */
const HIGHLIGHT_CLASSES = ['outline-2', 'outline-solid', 'outline-offset-4']
const HIGHLIGHT_COLOR_CLASS = 'outline-primary-400/60'
/** The outline fades to transparent. Its style must stay solid until then, because a style change does not animate. */
const HIGHLIGHT_FADE_CLASSES = ['transition-[outline-color]', 'duration-500']
const HIGHLIGHT_FADE_MS = 500
const HIGHLIGHT_FADED_CLASS = 'outline-transparent'
/** A row without its own corners gets these, so the outline is not square. A card keeps its corners. */
const HIGHLIGHT_CORNER_CLASSES = ['rounded-lg']

/**
 * Finds settings pages, the settings on them, and providers by name.
 *
 * Use when:
 * - The settings home filters its list as the user types.
 *
 * Expects:
 * - Settings routes keep their titles in route meta, as the settings layout reads them.
 * - The build-time scan in `@proj-airi/stage-pages/vite/settings-search` wrote `searchKeys` into the route meta.
 * - `providers` lists the runtime items of each page, such as character cards, by route path.
 *   The search calls them each time a person starts to search, so the items are fresh.
 *
 * Returns:
 * - The results in index order, with titles that start with the query first. An empty query returns no results.
 */
export function useSettingsSearch(
  query: MaybeRefOrGetter<string>,
  providers: Readonly<Record<string, () => Promise<SettingsSearchProvider>>> = {},
) {
  const router = useRouter()
  const { t } = useI18n()
  const {
    allChatProvidersMetadata,
    allVisionProvidersMetadata,
    allAudioSpeechProvidersMetadata,
    allAudioTranscriptionProvidersMetadata,
  } = storeToRefs(useProviderStore())

  /** The runtime items of each page, by route path. */
  const itemsByPath = shallowRef<ReadonlyMap<string, SettingsSearchItem[]>>(new Map())
  const items = computed(() => [...itemsByPath.value].flatMap(([path, pathItems]) => pathItems.map(item => ({ path, item }))))
  let loadGeneration = 0

  /** Loads every provider. Each page's items show as soon as they arrive, so a slow catalog does not hold back the cards. */
  function loadItems() {
    const generation = ++loadGeneration
    for (const [path, load] of Object.entries(providers)) {
      void (async () => {
        try {
          const provide = await load()
          const loaded = await provide({ t })
          if (generation === loadGeneration)
            itemsByPath.value = new Map([...itemsByPath.value, [path, loaded]])
        }
        catch (error) {
          // One failing provider, such as an offline model catalog, must not hide the other results.
          console.warn(`[settings search] The items of ${path} did not load:`, errorMessageFrom(error) ?? error)
        }
      })()
    }
  }

  watch(() => toValue(query).trim() !== '', (searching) => {
    if (searching)
      loadItems()
  }, { immediate: true })

  const index = computed<SettingsSearchResult[]>(() => {
    const pages = new Map<string, SearchPage>()

    // Routes with parameters, such as one card, need data that a route does not have. Providers name theirs below.
    for (const route of router.getRoutes()) {
      if (!route.path.startsWith(`${SETTINGS_ROOT}/`) || route.path.includes(':'))
        continue
      const meta = route.meta as SettingsSearchRouteMeta
      const title = meta.titleKey ? t(meta.titleKey) : meta.title
      if (!title)
        continue
      pages.set(route.path, {
        title,
        location: [],
        description: meta.descriptionKey ? t(meta.descriptionKey) : meta.description ?? '',
        icon: meta.icon,
        searchKeys: meta.searchKeys ?? [],
      })
    }

    // The location of a page is the titled pages on its path, from the top.
    for (const [path, page] of pages) {
      const segments = path.slice(SETTINGS_ROOT.length + 1).split('/')
      const ancestors = segments.slice(0, -1)
        .map((_, end) => pages.get(`${SETTINGS_ROOT}/${segments.slice(0, end + 1).join('/')}`))
        .filter(ancestor => ancestor !== undefined)
      page.location = ancestors.map(ancestor => ancestor.title)
      page.icon ??= ancestors.findLast(ancestor => ancestor.icon)?.icon
    }

    // Provider pages take their names from the provider registry, as the providers page shows them.
    // A provider page can be a route with a parameter, so its settings come from the route that its link resolves to.
    const providersPage = pages.get(PROVIDERS_PAGE)
    const providerGroups: Array<[string, ProviderMetadata[]]> = [
      ['chat', allChatProvidersMetadata.value],
      ['vision', allVisionProvidersMetadata.value],
      ['speech', allAudioSpeechProvidersMetadata.value],
      ['transcription', allAudioTranscriptionProvidersMetadata.value],
    ]
    // Some providers keep their settings on a module page, such as a local transcriber on the speech recognition page.
    // Such a provider is a result of its own, under that page, and the page keeps its own entry and settings.
    const providerPages: Array<[string, SearchPage]> = []
    for (const [category, providers] of providerGroups) {
      const location = [providersPage?.title, t(`settings.pages.providers.categories.${category}.title`)].filter(title => title !== undefined)
      for (const provider of providers) {
        // The providers page hides the No Speech choice. It has no settings.
        if (!provider.to || provider.id === 'speech-noop')
          continue
        const routePage = pages.get(provider.to)
        const meta = router.resolve(provider.to).matched.at(-1)?.meta as SettingsSearchRouteMeta | undefined
        providerPages.push([provider.to, {
          title: provider.localizedName,
          location: routePage ? [...routePage.location, routePage.title] : location,
          description: location.join(LOCATION_SEPARATOR),
          icon: provider.icon ?? providersPage?.icon,
          searchKeys: routePage ? [] : meta?.searchKeys ?? [],
        }])
      }
    }
    const providerPageByPath = new Map(providerPages.toReversed())

    const results: SettingsSearchResult[] = []
    // A runtime item opens its own page, or the listing page at its row. Its location is the page that lists it.
    for (const { path, item } of items.value) {
      const itemPath = (item.to ?? '').split('?')[0]
      const listing = pages.get(path) ?? pages.get(itemPath) ?? providerPageByPath.get(itemPath)
      results.push({
        title: item.title,
        description: [...(listing ? [...listing.location, listing.title] : []), ...(item.section ? [item.section] : [])].join(LOCATION_SEPARATOR),
        icon: listing?.icon,
        to: item.to ?? settingsSearchLocation(path, { keys: [item.key], gates: item.gate ? [item.gate] : [] }),
      })
    }
    for (const [path, page] of [...pages, ...providerPages]) {
      results.push({
        title: page.title,
        description: page.location.length ? page.location.join(LOCATION_SEPARATOR) : page.description,
        icon: page.icon,
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
          description: [...page.location, page.title].join(LOCATION_SEPARATOR),
          icon: page.icon,
          to: settingsSearchLocation(path, { keys }),
        })
      }
    }
    // The same name at the same place can come twice, such as a provider page and the provider's card on that page.
    // Runtime items come first, so the result that points to a row stays.
    const seen = new Set<string>()
    return results.filter((result) => {
      const key = `${result.to.split('?')[0]}\n${result.title}\n${result.description}`
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
 * Scrolls to the setting that a search result names, then highlights its row.
 *
 * Use when:
 * - A settings layout owns the scroll container of its pages.
 *
 * Expects:
 * - The route query {@link SETTINGS_SEARCH_QUERY} names the keys of the setting, one key in each parameter.
 *   {@link SETTINGS_SEARCH_GATE_QUERY} can name the row to show when the setting is not on the page, such as a provider card.
 * - The build-time scan or the page marked the row with the same key in {@link SETTINGS_SEARCH_ATTRIBUTE},
 *   and the scan wrote the gate of each conditional setting into `meta.searchGates`.
 *
 * Returns:
 * - Nothing. A setting that shows only in another state is not on the page. Its gate, such as the switch that turns it on,
 *   gets the highlight instead. Without a gate, such as a setting of another model type, a toast says so.
 */
export function useSettingsSearchReveal(container: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const route = useRoute()
  const { t } = useI18n()
  let stopWaiting: (() => void) | undefined

  function highlight(row: HTMLElement) {
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const corners = getComputedStyle(row).borderRadius === '0px' ? HIGHLIGHT_CORNER_CLASSES : []
    const added = [...corners, ...HIGHLIGHT_CLASSES, HIGHLIGHT_COLOR_CLASS]
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
  watch(() => [route.path, route.query[SETTINGS_SEARCH_QUERY], route.query[SETTINGS_SEARCH_GATE_QUERY], toValue(container)] as const, ([, , , root]) => {
    stopWaiting?.()
    // Settings with the same name, such as "Scale" of each model type, share one result. The page shows one of them.
    const { keys, gates } = settingsSearchTargetOf(route.query)
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

    const row = findAny(keys)
    if (row) {
      highlight(row)
      return
    }

    // The row is not rendered yet, or it shows only in another state. Watch the page until it settles.
    let gateShown = false
    let quiet: ReturnType<typeof setTimeout> | undefined
    const opened = new Set<HTMLElement>()
    // The nearest gate on the page decides the next step. A collapsed section opens, because that changes only the view,
    // and the search waits for the row again. Any other gate, such as a switch, only gets the highlight: search never changes a setting.
    const settle = () => {
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
          highlight(gate)
        }
        return
      }
    }
    const observer = new MutationObserver(() => {
      const found = findAny(keys)
      if (found) {
        stopWaiting?.()
        highlight(found)
        return
      }
      // The page stopped changing and the setting is still missing, so the current state hides it.
      clearTimeout(quiet)
      quiet = setTimeout(settle, REVEAL_QUIET_MS)
    })
    quiet = setTimeout(settle, REVEAL_QUIET_MS)
    const timeout = setTimeout(() => {
      stopWaiting?.()
      const found = findAny(keys)
      const gate = found ? null : findAny(gateKeys)
      if (found)
        highlight(found)
      else if (gate && !gateShown)
        highlight(gate)
      else if (!gate)
        toast.info(t('settings.search.not-shown', { name: t(keys[0] ?? '') }))
    }, REVEAL_TIMEOUT_MS)
    observer.observe(root, { childList: true, subtree: true })
    stopWaiting = () => {
      observer.disconnect()
      clearTimeout(timeout)
      clearTimeout(quiet)
      stopWaiting = undefined
    }
  }, { flush: 'post', immediate: true })

  onScopeDispose(() => stopWaiting?.())
}
