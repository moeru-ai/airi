import type { Nodes, PhrasingContent, Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'

import remarkParse from 'remark-parse'

import { unified } from 'unified'

export interface SpeechTextOptions {
  /**
   * One character that the output keeps as often as the source has it, also inside unspoken nodes.
   * The speech stream puts it where special tokens and flushes occur, then splits the output on it.
   */
  marker?: string
}

/** A delimiter between two ASCII operands is an operator, for example `x**2` or `a*b*c`, not emphasis. */
const asciiOperand = /^[A-Z0-9]$/i

/**
 * Compiles markdown to the text that a TTS provider reads.
 *
 * Markup that has no sound is removed: emphasis delimiters, heading and list markers, link URLs, code
 * blocks, and HTML. Blocks are joined with a line break, so the TTS chunker pauses between them.
 * Symbols that the parser keeps as text, for example `2 * 3`, `2**10`, or `x ~= 3`, stay unchanged.
 */
export const remarkSpeech: Plugin<[SpeechTextOptions?], Root, string> = function (options) {
  this.compiler = (tree, file) => compile(tree as Root, String(file), options?.marker)
}

export function toSpeechText(markdown: string, options?: SpeechTextOptions): string {
  return String(unified().use(remarkParse).use(remarkSpeech, options).processSync(markdown))
}

function compile(tree: Root, source: string, marker: string | undefined): string {
  // TODO: Read literal symbols as words, for example `*` as "times" and `~=` as "approximately equals".
  // This needs a spoken lexicon for each language. Its place, packages/i18n or a separate table, is not decided.
  // TODO: Select the spoken language for each span. Replies often switch languages in one sentence,
  // so the voice language alone cannot select the words.

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

  function blocks(nodes: readonly RootContent[]): string {
    return nodes.map(block).filter(Boolean).join('\n')
  }

  function block(node: RootContent): string {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
        return phrasing(node.children)
      case 'blockquote':
      case 'list':
      case 'listItem':
        return blocks(node.children)
      // TODO: Tell the listener that the reply has code, instead of a skip without a sound.
      default:
        return keepMarkers(node, '')
    }
  }

  function phrasing(nodes: readonly PhrasingContent[]): string {
    return nodes.map(inline).join('')
  }

  function inline(node: PhrasingContent): string {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        return node.value
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
