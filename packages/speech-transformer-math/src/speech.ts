import type { MathJson } from '@proj-airi/mathjson'

import type { MathSpeechExtension, RenderHandler, RenderHandlers } from './extension'
import type { MathLanguage, MathLocale } from './locale'

import { argsOf, headOf, isFunction, textOf } from '@proj-airi/mathjson'

import { rawHead } from './heads'
import { en } from './locales/en'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { zh } from './locales/zh'
import { lowerMath } from './lower'
import { parseMath } from './parse'
import { renderMath } from './render'

/** The built-in locale packs: Chinese, English, Japanese, and Korean. */
export const builtinLocales: readonly MathLocale[] = [en, ja, ko, zh]

export interface MathSpeechOptions {
  /** The locale packs that the instance reads in. The default is {@link builtinLocales}. */
  locales?: readonly MathLocale[]
  /** Notation that the core rules do not read, for example chemistry. */
  extensions?: readonly MathSpeechExtension[]
  /** The language of the pack that reads a language without a pack. The default is `en`. */
  fallbackLanguage?: MathLanguage
}

/**
 * The primary language subtag of a BCP 47 code: `zh` for `zh-CN`, `ko` for `ko_KR`. Chinese dialect codes are `zh`,
 * because the readers have one Chinese pack.
 */
export function primaryLanguage(code: string): string {
  const primary = code.toLowerCase().split(/[-_]/)[0] ?? ''
  return primary === 'cmn' || primary === 'yue' ? 'zh' : primary
}

/**
 * Reads TeX formulas as words, with a set of locale packs and extensions.
 *
 * Each instance owns its packs, so two projects, or two tests, can read differently in one process.
 *
 * Call stack of {@link MathSpeech.speak}:
 *
 * speak
 *   -> {@link parseMath} (./parse): KaTeX parse tree to the syntax tree
 *     -> {@link lowerMath} (./lower): syntax tree to MathJSON, the rules of meaning
 *       -> extension `lower`: the source of raw commands, for example `\ce{}`, to MathJSON
 *         -> {@link renderMath} (./render): MathJSON to the words of the language
 *
 * @example
 * const speech = new MathSpeech()
 * speech.speak('x^2', 'en')
 * // => 'x squared'
 */
export class MathSpeech {
  private readonly locales = new Map<string, MathLocale>()
  private readonly extensions: readonly MathSpeechExtension[]
  /** The TeX commands, without the backslash, whose source the extensions read, for example `ce`. */
  readonly rawCommands: readonly string[]
  private readonly handlers: RenderHandlers
  private readonly fallbackLanguage: MathLanguage

  constructor(options: MathSpeechOptions = {}) {
    for (const locale of options.locales ?? builtinLocales)
      this.locales.set(locale.language, locale)
    this.extensions = options.extensions ?? []
    // Two extensions that claim one command or one head would replace each other silently, so both fail here.
    const commands = new Map<string, string>()
    const handlers: Record<string, RenderHandler> = {}
    const owners = new Map<string, string>()
    for (const extension of this.extensions) {
      for (const command of extension.rawCommands ?? []) {
        const owner = commands.get(command)
        if (owner !== undefined)
          throw new Error(`Extensions ${owner} and ${extension.name} both read \\${command}.`)
        commands.set(command, extension.name)
      }
      for (const [head, handler] of Object.entries(extension.render ?? {})) {
        const owner = owners.get(head)
        if (owner !== undefined)
          throw new Error(`Extensions ${owner} and ${extension.name} both read the head ${head}.`)
        owners.set(head, extension.name)
        handlers[head] = handler
      }
    }
    this.rawCommands = [...commands.keys()]
    this.handlers = handlers
    this.fallbackLanguage = options.fallbackLanguage ?? 'en'
  }

  /** Adds a locale pack, or replaces the pack of its language. Returns a function that restores the earlier pack. */
  register(locale: MathLocale): () => void {
    const previous = this.locales.get(locale.language)
    this.locales.set(locale.language, locale)
    return () => {
      if (previous)
        this.locales.set(locale.language, previous)
      else
        this.locales.delete(locale.language)
    }
  }

  /** Finds the pack of a BCP 47 code, or undefined when no pack reads it. */
  findLocale(code: string | undefined): MathLocale | undefined {
    return code === undefined ? undefined : this.locales.get(primaryLanguage(code))
  }

  /** Finds the pack of a BCP 47 code, or the fallback pack. */
  locale(code: string | undefined): MathLocale {
    const locale = this.findLocale(code) ?? this.locales.get(this.fallbackLanguage)
    if (!locale)
      throw new Error(`No locale pack reads ${code ?? 'an unknown language'}, and the fallback ${this.fallbackLanguage} has no pack.`)
    return locale
  }

  /**
   * Lowers TeX math source into MathJSON, without reading it.
   * Tools that inspect the meaning of a formula use it, for example a comparison with Compute Engine.
   */
  toMathJson(tex: string): MathJson {
    return this.lowerRaw(lowerMath(parseMath(tex, this.rawCommands)))
  }

  /** Reads TeX math source as words of one language. A language without a pack is read by the fallback pack. */
  speak(tex: string, language: string): string {
    return renderMath(this.toMathJson(tex), this.locale(language), this.handlers)
  }

  /** Replaces each `Raw` node with the MathJSON of the extension that owns its command. */
  private lowerRaw(expression: MathJson): MathJson {
    if (!isFunction(expression))
      return expression
    if (headOf(expression) === rawHead) {
      const [command, source] = argsOf(expression).map(textOf)
      const extension = this.extensions.find(item => item.lower && item.rawCommands?.includes(command!))
      return extension?.lower?.(command!, source!) ?? expression
    }
    return [expression[0], ...argsOf(expression).map(argument => this.lowerRaw(argument))]
  }
}
