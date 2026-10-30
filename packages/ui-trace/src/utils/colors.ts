import type { Shade } from '@proj-airi/chromatic'

import { chromaticColorFrom } from '@proj-airi/chromatic'
import { oklch, parse } from 'culori'

/**
 * Below this OKLCH chroma a color counts as gray, and chromatic keeps it as it is. Slate is about 0.05, and the 500
 * shades of colored hues are 0.12 or more.
 */
const NEUTRAL_CHROMA = 0.08

/**
 * The chromatic shades of track colors in each theme. Dark mode mirrors light mode around 500.
 *
 * - `fill`: solid capsules. A light fill in light mode, a dark fill in dark mode.
 * - `accent`: soft and striped capsules, which draw their color translucent, and marks such as lane dots and
 *   handoff lines. It is stronger than the fill, so a translucent capsule lands near the fill.
 * - `ink`: the glyph, the text, and the series inside every capsule. On a 200 fill, the 700 ink has a WCAG contrast of
 *   4.1 to 5.3 across the hues. A 600 ink falls under 3 for cyan, amber, and green.
 */
export const TRACK_SHADES = {
  light: { fill: 200, accent: 400, ink: 700 },
  dark: { fill: 800, accent: 600, ink: 200 },
} as const satisfies Record<'light' | 'dark', { fill: Shade, accent: Shade, ink: Shade }>

/** A role of a track color: the solid fill, the accent of translucent capsules and marks, or the ink inside. */
export type TrackColorRole = keyof typeof TRACK_SHADES.light

const cache = new Map<string, string>()

/** The OKLCH hue of a color, or undefined for a gray or an unknown color. */
function hueOf(color: string): number | undefined {
  const parsed = parse(color)
  const value = parsed ? oklch(parsed) : undefined
  return !value || value.h === undefined || (value.c ?? 0) < NEUTRAL_CHROMA ? undefined : value.h
}

/**
 * The drawn color of a track, a lane, or a state color in a theme and a role, see {@link TRACK_SHADES}.
 *
 * Profiles name colors as CSS colors. Chromatic takes the hue of the color and gives the shade of the AIRI palette, so
 * all tracks share one lightness and chroma per role, and they follow the theme. A gray color, for example the waiting
 * tracks, stays as it is.
 *
 * @example
 * themedColor('#3b82f6', false)
 * // => the 200 shade of the hue of '#3b82f6'
 */
export function themedColor(color: string, dark: boolean, role: TrackColorRole = 'fill'): string {
  const key = `${dark ? 'dark' : 'light'}:${role}:${color}`
  const cached = cache.get(key)
  if (cached)
    return cached
  const hue = hueOf(color)
  const result = hue === undefined ? color : chromaticColorFrom(hue, { shade: TRACK_SHADES[dark ? 'dark' : 'light'][role] }).toHex()
  cache.set(key, result)
  return result
}

/**
 * The ink inside a capsule of a track color, see {@link TRACK_SHADES}. Undefined for a gray color, which keeps the
 * default ink of the timeline.
 *
 * @example
 * themedInk('#06b6d4', false)
 * // => the 700 shade of the hue of '#06b6d4'
 */
export function themedInk(color: string, dark: boolean): string | undefined {
  return hueOf(color) === undefined ? undefined : themedColor(color, dark, 'ink')
}

/**
 * The capsule color of a track color for a capsule pattern: the fill for solid capsules, the accent for soft and
 * striped capsules, which draw it translucent.
 */
export function capsuleColor(color: string, dark: boolean, pattern: 'solid' | 'soft' | 'hatch' | undefined): string {
  return themedColor(color, dark, (pattern ?? 'solid') === 'solid' ? 'fill' : 'accent')
}
