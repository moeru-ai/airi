import type { Root, RootContent } from 'mdast'
import type { Plugin, Preset } from 'unified'

import remarkMath from 'remark-math'

import { SKIP, visit } from 'unist-util-visit'

const chatMathFenceLanguages = new Set(['latex', 'math', 'tex'])

/**
 * Checks whether a code-fence language belongs to the AIRI chat math syntax.
 *
 * These fences are consumed before syntax highlighting and must not be loaded
 * as Shiki languages.
 */
export function isChatMathFenceLanguage(language: string | undefined): boolean {
  return chatMathFenceLanguages.has(language?.toLowerCase() ?? '')
}

const remarkChatMath: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node, index, parent) => {
    const language = node.lang?.toLowerCase()
    if (index === undefined || !parent || !isChatMathFenceLanguage(language))
      return

    // `math` is the canonical remark-math fence. It must be filtered from
    // Shiki, but only `latex` and `tex` fences need conversion here.
    if (language === 'math')
      return

    const rows = node.value
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(Boolean)

    if (rows.length === 0) {
      // Streaming can expose a chat math fence before its first formula row.
      // Consume the marker instead of rendering an empty code block.
      parent.children.splice(index, 1)
      return [SKIP, index]
    }

    const meta = node.meta?.toLowerCase().split(/\s+/).filter(Boolean) ?? []
    const values = meta.includes('block') ? [node.value.trim()] : rows
    const mathNodes: RootContent[] = values.map(value => ({
      type: 'code',
      lang: 'math',
      meta: null,
      value,
    }))

    parent.children.splice(index, 1, ...mathNodes)
    // Tell the unist visitor to skip the newly inserted nodes and resume at
    // the index immediately after them, so each row is visited only once.
    return [SKIP, index + mathNodes.length]
  })
}

/**
 * Returns the markdown without a formula that is still open at its end, for a message that is still streaming.
 *
 * remark-math reads an unclosed `$$` as a formula up to the end of the text, so a half-written formula, as
 * `$$\frac{dx_t}{`, is a KaTeX error and flashes red until its closing `$$` arrives. A `latex`, `tex`, or `math` fence
 * that is still open has the same problem. The formula renders once it closes. Other code fences stay, because
 * their text is shown as written.
 *
 * @example
 * withoutPendingMath('Speed:\n\n$$\nu_t = \\frac{dx_t}{')
 * // => 'Speed:\n\n'
 */
export function withoutPendingMath(markdown: string): string {
  let fence: { marker: string, math: boolean, start: number } | undefined
  let dollars: number | undefined
  let offset = 0
  for (const line of markdown.split(/(?<=\n)/)) {
    const opening = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/.exec(line)
    if (fence) {
      if (opening && opening[1]!.startsWith(fence.marker) && !opening[2])
        fence = undefined
    }
    else if (opening) {
      fence = { marker: opening[1]!, math: isChatMathFenceLanguage(opening[2]), start: offset }
    }
    else {
      // Each `$$` outside code opens or closes a formula. An escaped `\$$` is text.
      for (const match of line.matchAll(/(?<!\\)\$\$/g))
        dollars = dollars === undefined ? offset + match.index : undefined
    }
    offset += line.length
  }
  if (fence?.math)
    return markdown.slice(0, fence.start)
  return dollars === undefined ? markdown : markdown.slice(0, dollars)
}

/**
 * Defines the math syntax for AIRI chat Markdown.
 *
 * A single dollar sign stays text, and `$$...$$` defines inline math. A
 * `latex` or `tex` fence contains one formula per non-empty row. The `block`
 * meta value keeps the fence intact.
 */
export const chatMathPreset = {
  plugins: [
    [remarkMath, { singleDollarTextMath: false }],
    remarkChatMath,
  ],
} satisfies Preset
