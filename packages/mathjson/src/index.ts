/**
 * The MathJSON expressions of the speech pipeline.
 *
 * The format follows MathJSON: a number object, a symbol string, or an array whose first item is the head. Standard
 * heads, for example `Divide`, `Power`, `Limit`, `D`, and `Interval`, keep their MathJSON meaning, so the formula speech
 * eval can compare them with Compute Engine. Speech also needs what the writer wrote, so the pipeline adds heads such
 * as `Percent`, `Group`, `Unit`, and `Chemistry`. See docs/ai/adr/2026-10-20-speech-text-preprocessor.md.
 *
 * Two representation choices differ from Compute Engine:
 * - A symbol keeps its TeX token, for example `\pi` or `x`, so locale packs key their words by TeX.
 * - A number keeps its digits as a string, for example `{ num: '3.14' }`, so `007` and `3.10` keep their digits.
 */
export type MathJson = MathJsonNumber | string | MathJsonFunction

/** A number with the digits that the writer wrote. */
export interface MathJsonNumber {
  readonly num: string
}

/** A function expression: the head, then its arguments. */
export type MathJsonFunction = readonly [head: string, ...args: MathJson[]]

/** The placeholder of an argument that the writer left out, for example the upper bound of `\sum_{i}`. */
export const nothing = 'Nothing'

/** Wraps literal text as a MathJSON string, which MathJSON quotes with apostrophes: `'card'`. */
export function text(value: string): string {
  return `'${value}'`
}

export function isText(value: MathJson): value is string {
  return typeof value === 'string' && value.length >= 2 && value.startsWith('\'') && value.endsWith('\'')
}

/** Reads the content of a MathJSON string. */
export function textOf(value: MathJson): string {
  return isText(value) ? value.slice(1, -1) : ''
}

export function isNumber(value: MathJson | undefined): value is MathJsonNumber {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'num' in value
}

export function isFunction(value: MathJson | undefined, head?: string): value is MathJsonFunction {
  return Array.isArray(value) && (head === undefined || value[0] === head)
}

export function isSymbol(value: MathJson | undefined): value is string {
  return typeof value === 'string' && !isText(value) && value !== nothing
}

export function headOf(value: MathJson | undefined): string | undefined {
  return isFunction(value) ? value[0] : undefined
}

export function argsOf(value: MathJson): readonly MathJson[] {
  return isFunction(value) ? value.slice(1) : []
}
