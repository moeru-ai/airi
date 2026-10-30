import type { GlyphPath, ItemGlyph } from '@proj-airi/timeline-canvas'

/** The prefix of the MingCute icon classes that profiles give their tracks, for example `i-mingcute:tool-line`. */
const MINGCUTE_PREFIX = 'i-mingcute:'

const ATTRIBUTE = /([a-z-]+)="([^"]*)"/g

let icons: Record<string, { body: string }> | undefined
let loading: Promise<void> | undefined
const glyphs = new Map<string, ItemGlyph | undefined>()

/**
 * The glyph of the paths of an SVG icon body in a 24 px box. A path takes its fill and stroke from its attributes. A
 * path without a fill attribute fills, unless a group around it has `fill="none"`. Shapes other than paths draw
 * nothing.
 *
 * @example
 * glyphFromSvgBody('<path fill="none" stroke="currentColor" stroke-width="2" d="M4 10v4"/>')
 * // => { paths: [{ d: 'M4 10v4', fill: false, stroke: true, width: 2 }] }
 */
export function glyphFromSvgBody(body: string): ItemGlyph | undefined {
  const groupWithoutFill = /<g\s[^>]*fill="none"/.test(body)
  const paths: GlyphPath[] = []
  for (const match of body.matchAll(/<path\s([^>]*?)\/?>/g)) {
    const attributes = new Map([...(match[1] ?? '').matchAll(ATTRIBUTE)].map(([, name, value]) => [name!, value!]))
    const d = attributes.get('d')
    if (!d)
      continue
    const fill = attributes.get('fill')
    const stroke = attributes.get('stroke')
    const path: GlyphPath = {
      d,
      fill: fill === undefined ? !groupWithoutFill : fill !== 'none',
      stroke: stroke !== undefined && stroke !== 'none',
    }
    const width = attributes.get('stroke-width')
    if (width)
      path.width = Number(width)
    const cap = attributes.get('stroke-linecap')
    if (cap === 'round' || cap === 'square' || cap === 'butt')
      path.cap = cap
    const join = attributes.get('stroke-linejoin')
    if (join === 'round' || join === 'bevel' || join === 'miter')
      path.join = join
    paths.push(path)
  }
  return paths.length > 0 ? { paths } : undefined
}

/**
 * Loads the MingCute icons for {@link iconGlyph}. The set is about 1.5 MB, so it loads on demand, only on a page that
 * draws a trace. Until it loads, items draw without glyphs.
 */
export function loadIconGlyphs(): Promise<void> {
  loading ??= import('@iconify-json/mingcute').then((module) => {
    icons = module.icons.icons
  })
  return loading
}

/**
 * The glyph of an icon class of a track, for example `i-mingcute:tool-line`. Undefined for another icon set, an
 * unknown icon, or before {@link loadIconGlyphs} finished.
 */
export function iconGlyph(id: string): ItemGlyph | undefined {
  if (!icons || !id.startsWith(MINGCUTE_PREFIX))
    return undefined
  if (glyphs.has(id))
    return glyphs.get(id)
  const body = icons[id.slice(MINGCUTE_PREFIX.length)]?.body
  const glyph = body ? glyphFromSvgBody(body) : undefined
  glyphs.set(id, glyph)
  return glyph
}
