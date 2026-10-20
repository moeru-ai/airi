import type { IconifyJSON } from '@iconify-json/tabler'
import type { FunctionalComponent } from 'vue'

import { encodeSvgForCss, getIconData, iconToHTML, iconToSVG, replaceIDs } from '@iconify/utils'
import { array, nullable, number, object, optional, parse, record, string, union } from 'valibot'
import { h, shallowRef } from 'vue'

// The Tabler icons that a model can name: in a card, or for a tool call. A model can name any of them, so they do not
// go through UnoCSS, which only generates icons whose class a scanned file writes out.

/** The icon set. It loads on first use, so the app does not carry the icons until a model names one. */
let iconSet: Promise<IconifyJSON> | undefined
const loadedIconSet = shallowRef<IconifyJSON>()

/** Loads the Tabler icons, once. */
export function loadTablerIcons() {
  iconSet ??= import('@iconify-json/tabler').then(({ icons }) => {
    loadedIconSet.value = icons
    return icons
  })
  return iconSet
}

/** Whether Tabler has an icon of this name, for example `cloud-rain` or `star-filled`. */
export async function hasTablerIcon(name: string) {
  return Boolean(getIconData(await loadTablerIcons(), name))
}

/** Draws a Tabler icon by name. An unknown name, or an icon set that is still loading, draws nothing. */
export const TablerIcon: FunctionalComponent<{ name?: string }> = (props, { attrs }) => {
  const icons = loadedIconSet.value
  if (!props.name)
    return null
  if (!icons) {
    void loadTablerIcons()
    return null
  }
  const data = getIconData(icons, props.name)
  if (!data)
    return null
  const { attributes, body } = iconToSVG(data, { height: '1em' })
  return h('svg', { ...attributes, ...attrs, 'aria-hidden': 'true', 'innerHTML': replaceIDs(body) })
}
TablerIcon.props = ['name']
// The caller's class goes on the svg through `attrs`, so Vue must not add it a second time.
TablerIcon.inheritAttrs = false

/** One outline icon of the set, with the tags that Tabler gives it, for example `download` with `save` and `import`. */
interface SearchEntry {
  name: string
  tags: string[]
  nameWords: string[]
  tagWords: string[]
}

/** One search hit, with the variants of the icon that the query also matches, for example `bookmark-plus`. */
export interface TablerIconHit {
  name: string
  tags: string[]
  variants: string[]
}

/** `icons.json` of `@tabler/icons`. A tag is a word, a number such as `911`, or `null`. */
const tablerTagsSchema = record(string(), object({
  tags: optional(array(nullable(union([string(), number()]))), []),
}))

let searchEntries: Promise<SearchEntry[]> | undefined
const loadedSearchEntries = shallowRef<SearchEntry[]>()

function wordsOf(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !/^\d+$/.test(word))
}

/** Loads the outline icons with their tags, once. A search needs them, but drawing a name that exists does not. */
function loadSearchEntries() {
  searchEntries ??= Promise.all([
    loadTablerIcons(),
    // NOTICE:
    // The tags of each icon are only in `icons.json` at the root of `@tabler/icons`.
    // Its `exports` field maps every path to `./icons/*`, so `@tabler/icons/icons.json` does not resolve.
    // node_modules/@tabler/icons/package.json, https://github.com/tabler/tabler-icons/tree/main/packages/icons
    // Remove when `@tabler/icons` exports `icons.json`, and import it by the package name.
    import('../../node_modules/@tabler/icons/icons.json?raw'),
  ]).then(([icons, { default: text }]) => {
    const tags = parse(tablerTagsSchema, JSON.parse(text))
    // The chat draws outline icons, and Tabler names a filled one `<name>-filled`.
    const entries = Object.keys(icons.icons).filter(name => !name.endsWith('-filled')).map((name) => {
      const iconTags = (tags[name]?.tags ?? []).flatMap(tag => tag === null ? [] : [String(tag)])
      return { name, tags: iconTags, nameWords: wordsOf(name), tagWords: [...new Set(iconTags.flatMap(wordsOf))] }
    })
    loadedSearchEntries.value = entries
    return entries
  })
  return searchEntries
}

/**
 * How well one word of a query names one word of an icon. A word matches whole, or as the start of the other word, so
 * "search" finds "searching" and "cloud" finds "clouds".
 */
function wordScore(query: string, word: string) {
  if (query === word)
    return 2
  // A short word, for example `up`, would start too many other words.
  if ((query.length >= 3 && word.startsWith(query)) || (word.length >= 3 && query.startsWith(word)))
    return 1
  return 0
}

/**
 * Ranks the icons for a query, best first. A word of the name counts more than a tag, because the name says what the
 * icon draws, and a tag says what it can stand for. An icon ranks by the query words that it matches, then by how few
 * other words its name has, so `cloud` comes before `cloud-rain`.
 */
function rank(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = wordsOf(query)
  if (words.length === 0)
    return []

  const ranked = entries.flatMap((entry) => {
    let score = 0
    let matched = 0
    let nameMatched = 0
    for (const word of words) {
      const name = Math.max(0, ...entry.nameWords.map(entryWord => wordScore(word, entryWord)))
      const tag = Math.max(0, ...entry.tagWords.map(entryWord => wordScore(word, entryWord)))
      if (name > 0)
        nameMatched += 1
      if (name > 0 || tag > 0)
        matched += 1
      score += name > 0 ? name + 2 : tag
    }
    return matched > 0 ? [{ entry, score, matched, extra: entry.nameWords.length - nameMatched }] : []
  })
  ranked.sort((left, right) =>
    right.matched - left.matched
    || right.score - left.score
    || left.extra - right.extra
    || left.entry.name.length - right.entry.name.length
    || left.entry.name.localeCompare(right.entry.name))

  return ranked.map(({ entry }) => entry)
}

/**
 * Finds Tabler icons by the English words of their names and tags, best first.
 *
 * Each hit keeps its tags, so a model sees what else the icon can stand for. A variant, for example `bookmark-off`,
 * goes with its icon instead of taking a place of its own, so the hits cover more meanings.
 *
 * @example
 * await searchTablerIcons('save')
 * // => [{ name: 'archive', tags: ['storage', 'box', 'archived', 'save', ...], variants: ['archive-off'] }, ...]
 */
export async function searchTablerIcons(query: string, limit = 10): Promise<TablerIconHit[]> {
  const hits: TablerIconHit[] = []
  for (const entry of rank(await loadSearchEntries(), query)) {
    const icon = hits.find(hit => entry.name.startsWith(`${hit.name}-`))
    if (icon)
      icon.variants.push(entry.name)
    else if (hits.length < limit)
      hits.push({ name: entry.name, tags: entry.tags, variants: [] })
  }
  return hits
}

/**
 * The outline icon of the best candidate. A candidate is an icon name, or English words that the search reads. A real
 * name among the candidates comes first, because a search for a wrong name finds only one of its words. The search
 * then corrects a name that is close. While the tags load, a candidate that is no name finds nothing.
 */
function pickIcon(icons: IconifyJSON, candidates: readonly string[]) {
  for (const candidate of candidates) {
    const exact = getIconData(icons, candidate.trim().toLowerCase().replace(/-filled$/, ''))
    if (exact)
      return exact
  }
  const entries = loadedSearchEntries.value
  if (!entries) {
    void loadSearchEntries()
    return undefined
  }
  for (const candidate of candidates) {
    const [best] = rank(entries, candidate)
    if (best)
      return getIconData(icons, best.name)
  }
  return undefined
}

/**
 * The outline icon of the best candidate, as the value of `--un-icon`. The chat draws every tool icon as an outline.
 *
 * UnoCSS draws a one-color icon class as a mask of its `--un-icon` variable, at the size and color of the class
 * (`@unocss/preset-icons`). So an element with an icon class draws this icon instead when its style sets the variable,
 * and it keeps its own icon when no candidate leads to one.
 *
 * Returns `undefined` while the icons load. It reads reactive state, so a view draws again once they arrive.
 *
 * @example
 * tablerIconMask(['currency-baht', 'coin'])
 * // => 'url("data:image/svg+xml;utf8,...")', the shape of `currency-baht`
 */
export function tablerIconMask(candidates: readonly string[]) {
  if (candidates.length === 0)
    return undefined
  const icons = loadedIconSet.value
  if (!icons) {
    void loadTablerIcons()
    return undefined
  }
  const data = pickIcon(icons, candidates)
  if (!data)
    return undefined
  const { attributes, body } = iconToSVG(data)
  return `url("data:image/svg+xml;utf8,${encodeSvgForCss(iconToHTML(replaceIDs(body), attributes))}")`
}
