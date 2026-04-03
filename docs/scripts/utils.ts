import type MarkdownIt from 'markdown-it'

function extractJSDocLink(content: string): string | null {
  if (!content.startsWith('{@link')) {
    return null
  }

  const closingBraceIndex = content.indexOf('}')
  if (closingBraceIndex < 0) {
    return null
  }

  const linkText = content.slice('{@link'.length, closingBraceIndex).trim()
  return linkText || null
}

// Define a custom plugin to transform JSDoc @link tags
export function transformJSDocLinks(md: MarkdownIt) {
  md.core.ruler.push('transform-jsdoc-links', (state) => {
    state.tokens.forEach((token) => {
      if (token.type === 'inline' && token.children?.length) {
        for (let i = 0; i < token.children.length; i++) {
          const child = token.children[i]!
          if (child.type === 'text' && child.content.startsWith('{@link')) {
            const linkText = extractJSDocLink(child.content)
            if (linkText) {
              const linkNode = new state.Token('link_open', 'a', 1)
              linkNode.attrSet('href', linkText)
              linkNode.attrSet('target', '_blank')
              const textNode = new state.Token('text', '', 0)
              textNode.content = 'reference'
              token.children.splice(i, 1, linkNode, textNode, new state.Token('link_close', 'a', -1))
              i += 2 // Skip the added link and text tokens
            }
          }
        }
      }
    })
  })
}
