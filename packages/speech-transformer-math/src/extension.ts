import type { MathJson, MathJsonFunction } from '@proj-airi/mathjson'

import type { MathLocale } from './locale'

/** What a render handler gets besides its expression. */
export interface RenderContext {
  /** The locale pack that reads the formula. */
  lexicon: MathLocale
  /** Reads a part of the expression with the same pack and handlers. */
  render: (expression: MathJson) => string
}

/** Reads one MathJSON head of an extension as words. */
export type RenderHandler = (expression: MathJsonFunction, context: RenderContext) => string

/** Render handlers by MathJSON head, for example `Chemistry`. */
export type RenderHandlers = Readonly<Record<string, RenderHandler>>

/**
 * Adds notation that the core rules do not read, for example mhchem chemistry.
 *
 * An extension can work in two steps:
 *
 * 1. Lowering. KaTeX does not parse the commands in `rawCommands`, for example `\ce`. The parser keeps their source,
 *    and `lower` turns the source into MathJSON with the heads of the extension.
 * 2. Rendering. `render` reads those heads with the words of a language.
 *
 * @example
 * const shout: MathSpeechExtension = {
 *   name: 'shout',
 *   rawCommands: ['shout'],
 *   lower: (_, source) => ['Shout', `'${source}'`],
 *   render: { Shout: ([, value]) => String(value).toUpperCase() },
 * }
 */
export interface MathSpeechExtension {
  /** A name for errors and debugging, for example `chemistry`. */
  name: string
  /** TeX commands without the backslash whose argument is source for `lower`, for example `ce`. */
  rawCommands?: readonly string[]
  /** Lowers the source of one raw command. `command` is one of `rawCommands`. */
  lower?: (command: string, source: string) => MathJson
  render?: RenderHandlers
}
