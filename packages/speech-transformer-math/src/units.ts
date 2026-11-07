import type { UnitLocale } from './locale'

/**
 * Reads unit symbols with the SI rules of the SI brochure and NIST SP 811.
 *
 * A symbol is a prefix and a unit, for example `µm` is micro and meter. A locale pack names each prefix and unit once,
 * and this module composes them, so a unit gets every prefix without one entry for each pair.
 */

/** `da` is the only prefix of two letters, so a symbol tries it before the prefixes of one letter. */
const prefixLengths = [2, 1]
/**
 * Units that take only some prefixes. Without the limit, `ft` reads as femtotonnes and `pt` as picotonnes, and `dB`
 * would be decibytes if decibel had no entry.
 */
const prefixLimits: Readonly<Record<string, ReadonlySet<string>>> = {
  t: new Set(['k', 'M', 'G']),
  B: new Set(['k', 'M', 'G', 'T', 'P', 'E']),
}

/** Finds the words of a unit symbol without its power: an override or a whole unit first, then a prefix and a unit. */
function unitWords(symbol: string, locale: UnitLocale): string | undefined {
  const exact = locale.overrides?.[symbol] ?? locale.plain[symbol] ?? locale.units[symbol]
  if (exact !== undefined)
    return exact
  for (const length of prefixLengths) {
    const prefix = locale.prefixes[symbol.slice(0, length)]
    const unit = locale.units[symbol.slice(length)]
    const limit = prefixLimits[symbol.slice(length)]
    if (prefix && unit && (!limit || limit.has(symbol.slice(0, length))))
      return prefix + unit
  }
  return undefined
}

/**
 * Reads a unit symbol, for example `km`, `µs`, `MHz`, `cm^2`, or `m3`. Returns undefined for text that is not a unit.
 * `µ`, `μ`, `\mu`, and a leading `u` all write micro.
 *
 * @example
 * speakUnit('µm', en.units)
 * // => 'micrometers'
 * speakUnit('cm^2', zh.units)
 * // => '平方厘米'
 */
export function speakUnit(symbol: string, locale: UnitLocale): string | undefined {
  if (symbol.includes(' ')) {
    // `kg m2` of `\mathrm{kg\cdot m^2}`: each factor reads, in order. Only the last one is plural, as "kilogram
    // square meters" and "newton meters".
    const words = symbol.split(/\s+/).filter(Boolean).map(factor => speakUnit(factor, locale))
    if (words.includes(undefined))
      return undefined
    const spoken = (words as string[]).map((word, index) => index < words.length - 1 ? locale.singular?.(word) ?? word : word)
    return locale.joinFactors?.(spoken) ?? spoken.join(' ')
  }
  const normalized = symbol.replace(/\\mu\s*|μ|^u(?=[a-z])/gi, 'µ').replace(/\\Omega/g, 'Ω').replace(/\\AA/g, 'Å').trim()
  const power = /^(.+?)\^?([23])$/.exec(normalized)
  const words = unitWords(power ? power[1]! : normalized, locale)
  if (words === undefined || !power)
    return words
  return locale.power(words, power[2] as '2' | '3')
}
