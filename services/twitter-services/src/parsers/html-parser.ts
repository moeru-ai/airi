import type { Element, Root } from 'hast'

import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export interface ParseOptions {
  fragment?: boolean
}

/**
 * HTML Parser
 * Uses rehype to convert HTML strings to AST, for further processing
 */
export class HtmlParser {
  /**
   * Parse HTML string to rehype AST
   * @param html HTML string
   * @param options Parse options
   * @returns hast syntax tree
   */
  static parse(html: string, options: ParseOptions = {}): Root {
    const processor = unified().use(rehypeParse, {
      fragment: options.fragment ?? false,
    })

    const tree = processor.parse(html)
    const file = processor.runSync(tree)

    return file as Root
  }

  /**
   * Find elements by selector
   * @param tree AST tree
   * @param selector Simplified selector (tagName, className, id)
   * @returns Matching element array
   */
  static select(tree: Root, selector: string): Element[] {
    const elements: Element[] = []

    visit(tree, 'element', (node) => {
      // Simple selector implementation
      if (this.matchesSelector(node, selector)) {
        elements.push(node)
      }
    })

    return elements
  }

  /**
   * Simple selector matching logic
   */
  private static matchesSelector(node: Element, selector: string): boolean {
    // Tag selector
    if (selector.match(/^[a-z0-9]+$/i)) {
      return node.tagName === selector
    }

    // Class selector
    if (selector.startsWith('.')) {
      const className = selector.slice(1)
      return (node.properties?.className as string[])?.includes(className) ?? false
    }

    // ID selector
    if (selector.startsWith('#')) {
      const id = selector.slice(1)
      return node.properties?.id === id
    }

    // Data attribute selector
    if (selector.startsWith('[data-')) {
      // Use non-greedy quantifier and more specific character classes to avoid backtracking
      const match = selector.match(/\[([^=\]]+)=(['"]?)([^"'\]]+)\2\]/)
      if (match) {
        const [, attr, , value] = match
        return node.properties?.[attr] === value
      }
    }

    return false
  }

  /**
   * Visit specific node type
   * @param tree AST tree
   * @param nodeType Node type
   * @param visitor Visitor function
   */
  static visit(tree: Element | Root, nodeType: string, visitor: (node: any) => void): void {
    visit(tree, nodeType, visitor)
  }
}
