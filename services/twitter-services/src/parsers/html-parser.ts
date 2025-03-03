import type { Element, Root } from 'hast'

import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

export interface ParseOptions {
  fragment?: boolean
}

/**
 * HTML 解析器
 * 使用 rehype 将 HTML 字符串转换为 AST，便于后续处理
 */
export class HtmlParser {
  /**
   * 将 HTML 字符串解析为 rehype AST
   * @param html HTML 字符串
   * @param options 解析选项
   * @returns hast 语法树
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
   * 根据选择器查找元素
   * @param tree AST 树
   * @param selector 简化版选择器 (tagName, className, id)
   * @returns 匹配的元素数组
   */
  static select(tree: Root, selector: string): Element[] {
    const elements: Element[] = []

    visit(tree, 'element', (node) => {
      // 简单选择器实现
      if (this.matchesSelector(node, selector)) {
        elements.push(node)
      }
    })

    return elements
  }

  /**
   * 简单的选择器匹配逻辑
   */
  private static matchesSelector(node: Element, selector: string): boolean {
    // 标签选择器
    if (selector.match(/^[a-z0-9]+$/i)) {
      return node.tagName === selector
    }

    // 类选择器
    if (selector.startsWith('.')) {
      const className = selector.slice(1)
      return (node.properties?.className as string[])?.includes(className) ?? false
    }

    // ID 选择器
    if (selector.startsWith('#')) {
      const id = selector.slice(1)
      return node.properties?.id === id
    }

    // 数据属性选择器
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
   * 访问特定类型的节点
   * @param tree AST 树
   * @param nodeType 节点类型
   * @param visitor 访问器函数
   */
  static visit(tree: Element | Root, nodeType: string, visitor: (node: any) => void): void {
    visit(tree, nodeType, visitor)
  }
}
