import type { Root, RootContent } from 'mdast'
import type { Plugin, Preset } from 'unified'

import remarkMath from 'remark-math'

import { SKIP, visit } from 'unist-util-visit'

const remarkChatMath: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node, index, parent) => {
    if (index === undefined || !parent || !['latex', 'tex'].includes(node.lang?.toLowerCase() ?? ''))
      return

    const rows = node.value
      .split(/\r?\n/)
      .map(row => row.trim())
      .filter(Boolean)

    if (rows.length === 0)
      return

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
