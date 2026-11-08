import type { IconifyJSON } from '@iconify-json/tabler'
import type { FunctionalComponent } from 'vue'

import { encodeSvgForCss, getIconData, iconToHTML, iconToSVG, replaceIDs } from '@iconify/utils'
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

/** One outline icon of the set, with the words of its name, for example `cloud-rain` with `cloud` and `rain`. */
interface SearchEntry {
  name: string
  words: string[]
}

/** One search hit, with the variants of the icon that the query also matches, for example `bookmark-plus`. */
export interface TablerIconHit {
  name: string
  variants: string[]
}

let searchEntries: SearchEntry[] | undefined

function wordsOf(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !/^\d+$/.test(word))
}

/** The outline icons of the set. The chat draws outline icons, and Tabler names a filled one `<name>-filled`. */
function searchEntriesOf(icons: IconifyJSON) {
  searchEntries ??= Object.keys(icons.icons).filter(name => !name.endsWith('-filled')).map(name => ({ name, words: wordsOf(name) }))
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
 * Ranks the icons for a query, best first. An icon ranks by the query words that its name matches, then by how few
 * other words its name has, so `cloud` comes before `cloud-rain`.
 */
function rank(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = wordsOf(query)
  if (words.length === 0)
    return []

  const ranked = entries.flatMap((entry) => {
    let score = 0
    let matched = 0
    for (const word of words) {
      const best = Math.max(0, ...entry.words.map(entryWord => wordScore(word, entryWord)))
      score += best
      if (best > 0)
        matched += 1
    }
    return matched > 0 ? [{ entry, score, matched, extra: entry.words.length - matched }] : []
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
 * Finds Tabler icons by the English words of their names, best first. Tabler names an icon after what it draws, so a
 * query names a thing, for example "cloud rain" or "device floppy". A variant, for example `bookmark-off`, goes with
 * its icon instead of taking a place of its own, so the hits cover more icons.
 *
 * @example
 * await searchTablerIcons('cloud rain')
 * // => [{ name: 'cloud-rain', variants: [] }, { name: 'cloud', variants: ['cloud-off', ...] }, ...]
 */
export async function searchTablerIcons(query: string, limit = 10): Promise<TablerIconHit[]> {
  const hits: TablerIconHit[] = []
  for (const entry of rank(searchEntriesOf(await loadTablerIcons()), query)) {
    const icon = hits.find(hit => entry.name.startsWith(`${hit.name}-`))
    if (icon)
      icon.variants.push(entry.name)
    else if (hits.length < limit)
      hits.push({ name: entry.name, variants: [] })
  }
  return hits
}

/**
 * The outline icon of the best candidate. A candidate is an icon name, or English words that the search reads. A real
 * name among the candidates comes first, because a search for a wrong name finds only one of its words. The search
 * then corrects a name that is close.
 */
function pickIcon(icons: IconifyJSON, candidates: readonly string[]) {
  for (const candidate of candidates) {
    const exact = getIconData(icons, candidate.trim().toLowerCase().replace(/-filled$/, ''))
    if (exact)
      return exact
  }
  for (const candidate of candidates) {
    const [best] = rank(searchEntriesOf(icons), candidate)
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
