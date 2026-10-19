import type { IconifyJSON } from '@iconify-json/mingcute'
import type { FunctionalComponent } from 'vue'

import { encodeSvgForCss, getIconData, iconToHTML, iconToSVG, replaceIDs } from '@iconify/utils'
import { h, shallowRef } from 'vue'

// The MingCute icons that a model can name: in a card, or for a tool call. A model can name any of them, so they do not
// go through UnoCSS, which only generates icons whose class a scanned file writes out.

/** The icon set. It loads on first use, so the app does not carry 1.5 MB of icons until a model names one. */
let iconSet: Promise<IconifyJSON> | undefined
const loadedIconSet = shallowRef<IconifyJSON>()

/** Loads the MingCute icons, once. */
export function loadMingcuteIcons() {
  iconSet ??= import('@iconify-json/mingcute').then(({ icons }) => {
    loadedIconSet.value = icons
    return icons
  })
  return iconSet
}

/** Whether MingCute has an icon of this name. */
export async function hasMingcuteIcon(name: string) {
  return Boolean(getIconData(await loadMingcuteIcons(), name))
}

/** Draws a MingCute icon by name. An unknown name, or an icon set that is still loading, draws nothing. */
export const MingcuteIcon: FunctionalComponent<{ name?: string }> = (props, { attrs }) => {
  const icons = loadedIconSet.value
  if (!props.name)
    return null
  if (!icons) {
    void loadMingcuteIcons()
    return null
  }
  const data = getIconData(icons, props.name)
  if (!data)
    return null
  const { attributes, body } = iconToSVG(data, { height: '1em' })
  return h('svg', { ...attributes, ...attrs, 'aria-hidden': 'true', 'innerHTML': replaceIDs(body) })
}
MingcuteIcon.props = ['name']
// The caller's class goes on the svg through `attrs`, so Vue must not add it a second time.
MingcuteIcon.inheritAttrs = false

/** One drawing of the set, for example `cloud-rain`, with the styles that it comes in. */
interface IconShape {
  name: string
  words: string[]
  styles: string[]
}

const STYLE_PATTERN = /-(fill|line)$/
let shapes: IconShape[] | undefined

/** The drawings of the set. MingCute draws most of them twice, filled and as a line, so one search hit covers both. */
function shapesOf(icons: IconifyJSON) {
  if (shapes)
    return shapes
  const byName = new Map<string, IconShape>()
  for (const icon of Object.keys(icons.icons)) {
    const style = STYLE_PATTERN.exec(icon)?.[1]
    const name = style ? icon.slice(0, -style.length - 1) : icon
    const shape = byName.get(name) ?? { name, words: name.split('-').filter(word => !/^\d+$/.test(word)), styles: [] }
    if (style)
      shape.styles.push(style)
    byName.set(name, shape)
  }
  shapes = [...byName.values()]
  return shapes
}

/**
 * How well one word of a query names one word of an icon. A word matches whole, or as the start of the other word, so
 * "search" finds "searching" and "cloud" finds "clouds".
 */
function wordScore(query: string, word: string) {
  if (query === word)
    return 3
  // A short word, for example `up`, would start too many other words.
  if ((query.length >= 3 && word.startsWith(query)) || (word.length >= 3 && query.startsWith(word)))
    return 2
  return 0
}

/** Ranks the drawings for a query, best first. Returns each drawing with every style that it comes in. */
function rank(icons: IconifyJSON, query: string, limit: number): string[][] {
  const words = query.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (words.length === 0)
    return []

  const ranked = shapesOf(icons).flatMap((shape) => {
    let score = 0
    let matched = 0
    for (const word of words) {
      const best = Math.max(0, ...shape.words.map(entry => wordScore(word, entry)))
      score += best
      if (best > 0)
        matched += 1
    }
    return matched > 0 ? [{ shape, score, matched, extra: shape.words.length - matched }] : []
  })
  ranked.sort((left, right) =>
    right.matched - left.matched
    || right.score - left.score
    || left.extra - right.extra
    || left.shape.name.length - right.shape.name.length
    || left.shape.name.localeCompare(right.shape.name))

  return ranked.slice(0, limit).map(({ shape }) =>
    shape.styles.length > 0 ? shape.styles.map(style => `${shape.name}-${style}`) : [shape.name])
}

/**
 * Finds MingCute icons by the English words of their names, best first.
 *
 * MingCute ships names only, with no tags, so a query matches the words of a name. An icon ranks by the query words
 * that it matches, then by how few other words its name has, so `cloud` comes before `cloud-windy`. A numbered
 * variant, for example `search-2`, ranks with the plain name.
 *
 * Returns the full names, each drawing with every style that it comes in, for example `cloud-fill`.
 *
 * @example
 * await searchMingcuteIcons('rain')
 * // => [['rain-fill', 'rain-line'], ['heavy-rain-fill', 'heavy-rain-line'], ...]
 */
export async function searchMingcuteIcons(query: string, limit = 10): Promise<string[][]> {
  return rank(await loadMingcuteIcons(), query, limit)
}

/**
 * The filled icon of the best candidate. A candidate is an icon name, with or without its style, or English words that
 * the search reads. A real name among the candidates comes first, because a search for a wrong name finds only one of
 * its words. The search then corrects a name that is close.
 */
function pickIcon(icons: IconifyJSON, candidates: readonly string[]) {
  for (const candidate of candidates) {
    const exact = getIconData(icons, `${candidate.trim().toLowerCase().replace(STYLE_PATTERN, '')}-fill`)
    if (exact)
      return exact
  }
  for (const candidate of candidates) {
    const [best] = rank(icons, candidate, 1)
    const found = best?.find(entry => entry.endsWith('-fill')) ?? best?.[0]
    if (found)
      return getIconData(icons, found)
  }
  return undefined
}

/**
 * The filled icon of the best candidate, as the value of `--un-icon`. The chat draws every tool icon filled.
 *
 * UnoCSS draws a one-color icon class as a mask of its `--un-icon` variable, at the size and color of the class
 * (`@unocss/preset-icons`). So an element with an icon class draws this icon instead when its style sets the variable,
 * and it keeps its own icon when no candidate leads to one.
 *
 * Returns `undefined` while the icons load. It reads reactive state, so a view draws again once they arrive.
 *
 * @example
 * mingcuteIconMask(['exchange-baht', 'coin'])
 * // => 'url("data:image/svg+xml;utf8,...")', the shape of `exchange-baht-fill`
 */
export function mingcuteIconMask(candidates: readonly string[]) {
  if (candidates.length === 0)
    return undefined
  const icons = loadedIconSet.value
  if (!icons) {
    void loadMingcuteIcons()
    return undefined
  }
  const data = pickIcon(icons, candidates)
  if (!data)
    return undefined
  const { attributes, body } = iconToSVG(data)
  return `url("data:image/svg+xml;utf8,${encodeSvgForCss(iconToHTML(replaceIDs(body), attributes))}")`
}
