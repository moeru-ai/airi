import type { Nodes, PhrasingContent, Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'

import type { SpeechPreprocessor } from './preprocessor'

import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'

import { unified } from 'unified'

import { detectSpeechLanguage, toSpeechLanguage } from './language'
import { normalizeMathDelimiters } from './markdown'
import { mathSpeechPreprocessor, moneySpeechPreprocessor } from './preprocessor'

export interface SpeechTextOptions {
  /**
   * One character that the output keeps as often as the source has it, also inside unspoken nodes.
   * The speech stream puts it where special tokens and flushes occur, then splits the output on it.
   */
  marker?: string
  /**
   * BCP 47 code of the voice or the character, for example `zh-CN`.
   * The words around a formula or a price select its language first. This code is used when they do not.
   */
  language?: string
  /**
   * The spoken text before this markdown, when the markdown is one segment of a streamed reply, see ./segmenter.
   * A formula without words around it, as a display formula that starts the segment, reads in its language.
   */
  before?: string
  /**
   * The preprocessor plugins, in the order that their hooks run.
   * The default is the money plugin, then the math plugin. A list replaces the default, so it includes them to keep them.
   */
  preprocessors?: readonly SpeechPreprocessor[]
}

/** The default preprocessor plugins: money first, so a price reads before the math plugin looks for bare TeX. */
export function defaultSpeechPreprocessors(): SpeechPreprocessor[] {
  return [moneySpeechPreprocessor(), mathSpeechPreprocessor()]
}

/** A delimiter between two ASCII operands is an operator, for example `x**2` or `a*b*c`, not emphasis. */
const asciiOperand = /^[A-Z0-9]$/i
/** A sentence ends at these characters. The words of the sentence select the language of its formulas. */
const sentenceEnd = /[.!?。！？\n]/

/**
 * Compiles markdown to the text that a TTS provider reads.
 *
 * Markup that has no sound is removed: emphasis delimiters, heading and list markers, link URLs, code
 * blocks, and HTML. Blocks are joined with a line break, so the TTS chunker pauses between them.
 * Symbols that the parser keeps as text, for example `2 * 3`, `2**10`, or `x ~= 3`, stay unchanged.
 *
 * TeX formulas in `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and known commands without delimiters, such as
 * `\ce{H2O}`, are read as words. The words of the sentence around a formula select its language, and
 * `options.language` is used when they do not.
 */
export const remarkSpeech: Plugin<[SpeechTextOptions?], Root, string> = function (options) {
  this.compiler = (tree, file) => compile(tree as Root, String(file), options)
}

/**
 * Compiles markdown to the text that a TTS provider reads, with the preprocessor plugins of `options`.
 *
 * `\(...\)` and `\[...\]` become `$` delimiters first, because remark-math reads only `$`. Then each `prepare` hook
 * rewrites the markdown, in plugin order.
 */
export function toSpeechText(markdown: string, options?: SpeechTextOptions): string {
  const preprocessors = options?.preprocessors ?? defaultSpeechPreprocessors()
  const prepared = preprocessors.reduce((text, preprocessor) => preprocessor.prepare?.(text) ?? text, normalizeMathDelimiters(markdown))
  return String(unified().use(remarkParse).use(remarkMath).use(remarkSpeech, { ...options, preprocessors }).processSync(prepared))
}

function compile(tree: Root, source: string, options: SpeechTextOptions | undefined): string {
  // TODO: Read literal symbols outside formulas as words, for example `*` as "times" and `~=` as "approximately equals".
  // A prose preprocessor plugin can read them with the words of the locale packs of `mathSpeech`, see ./preprocessor/math.
  const marker = options?.marker
  const fallback = toSpeechLanguage(options?.language)
  const preprocessors = options?.preprocessors ?? defaultSpeechPreprocessors()

  function count(text: string): number {
    return marker ? text.split(marker).length - 1 : 0
  }

  function range(node: Nodes): string {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    return start === undefined || end === undefined ? '' : source.slice(start, end)
  }

  /** Adds the markers that the source of a node has but its spoken text lost, for example in a link URL. */
  function keepMarkers(node: Nodes, spoken: string): string {
    const missing = count(range(node)) - count(spoken)
    return marker && missing > 0 ? spoken + marker.repeat(missing) : spoken
  }

  function isOperator(node: Nodes): boolean {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined)
      return false

    return asciiOperand.test(source[start - 1] ?? '') && asciiOperand.test(source[end] ?? '')
  }

  /** The text of a node without its formulas. */
  function plain(node: Nodes): string {
    if (node.type === 'text')
      return node.value
    return 'children' in node ? node.children.map(child => plain(child as Nodes)).join('') : ''
  }

  /**
   * Reads a formula with the first formula hook that returns words, or keeps the source when none does.
   * Its markers move to its end, because words have no place for them.
   */
  function speakFormula(source: string, context: string): string {
    const tex = marker ? source.replaceAll(marker, '') : source
    const language = detectSpeechLanguage(context, fallback)
    let spoken = tex
    for (const preprocessor of preprocessors) {
      const words = preprocessor.formula?.(tex, { language })
      if (words !== undefined) {
        spoken = words
        break
      }
    }
    return spoken + (marker ?? '').repeat(count(source))
  }

  /** Runs the prose hooks over a run of text. `context` is the words of its sentence. */
  function speakProse(text: string, kind: 'text' | 'code', context: string): string {
    const language = detectSpeechLanguage(context, fallback)
    return preprocessors.reduce((rest, preprocessor) => preprocessor.prose?.(rest, { language, fallback, kind, readFormula: speakFormula }) ?? rest, text)
  }

  /**
   * Inline math follows the Pandoc rule, so `$5 and $10` stays text:
   * the content does not start or end with a space, and a digit does not follow the closing `$`.
   */
  function isFormula(node: Extract<PhrasingContent, { type: 'inlineMath' }>): boolean {
    if (range(node).startsWith('$$'))
      return true
    const after = sourceAfter(node)
    return !/^\s|\s$/.test(node.value) && !/^\d/.test(after)
  }

  function sourceAfter(node: Nodes): string {
    const end = node.position?.end.offset
    return end === undefined ? '' : source.slice(end, end + 1)
  }

  /** The words of the sentence that holds a formula, in the paragraph `nodes`. Other sentences are the fallback. */
  function sentenceAround(nodes: readonly PhrasingContent[], index: number): string {
    const before = nodes.slice(0, index).map(plain).join('')
    const after = nodes.slice(index + 1).map(plain).join('')
    const sentence = before.split(sentenceEnd).at(-1)! + after.split(sentenceEnd)[0]!
    if (/\p{L}{2,}/u.test(sentence))
      return sentence
    return /\p{L}{2,}/u.test(before + after) ? before + after : options?.before ?? ''
  }

  function blocks(nodes: readonly RootContent[]): string {
    return nodes.map((node, index) => block(node, nodes, index)).filter(Boolean).join('\n')
  }

  function block(node: RootContent, siblings: readonly RootContent[], index: number): string {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return phrasing(node.children)
      case 'blockquote':
      case 'list':
      case 'listItem':
        return blocks(node.children)
      case 'math': {
        // A display formula reads in the language of the text before it, or after it when it opens the reply.
        // In a streamed segment, the text before it can be in an earlier segment.
        const previous = siblings[index - 1] ? plain(siblings[index - 1]!) : options?.before ?? ''
        const context = [previous, siblings[index + 1] ? plain(siblings[index + 1]!) : ''].join('\n')
        return keepMarkers(node, speakFormula(node.value, context))
      }
      // TODO: Tell the listener that the reply has code, instead of a skip without a sound.
      default:
        return keepMarkers(node, '')
    }
  }

  function phrasing(nodes: readonly PhrasingContent[]): string {
    return nodes.map((node, index) => inline(node, nodes, index)).join('')
  }

  function inline(node: PhrasingContent, siblings: readonly PhrasingContent[], index: number): string {
    switch (node.type) {
      case 'text':
        // A voice can read `$5` in another language, so a price is read as words of its sentence.
        return speakProse(node.value, 'text', sentenceAround(siblings, index) + node.value)
      case 'inlineCode':
        return speakProse(node.value, 'code', node.value)
      case 'inlineMath':
        return isFormula(node) ? keepMarkers(node, speakFormula(node.value, sentenceAround(siblings, index))) : keepMarkers(node, range(node))
      case 'emphasis':
      case 'strong':
      case 'delete':
        // CommonMark reads `x**2 + y**2` as strong text, but the writer meant two powers.
        // The source text, delimiters included, keeps the operators.
        return isOperator(node) ? range(node) : phrasing(node.children)
      case 'link':
      case 'linkReference':
        return keepMarkers(node, phrasing(node.children))
      case 'image':
      case 'imageReference':
        return keepMarkers(node, node.alt ?? '')
      case 'break':
        return '\n'
      default:
        return keepMarkers(node, '')
    }
  }

  return blocks(tree.children)
}
