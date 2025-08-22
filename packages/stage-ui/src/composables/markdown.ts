import shiki from '@shikijs/markdown-it'
import MarkdownIt from 'markdown-it'
import RehypeStringify from 'rehype-stringify'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { unified } from 'unified'

let markdownItInstance: MarkdownIt | null = null

async function getMarkdownItInstance() {
  if (!markdownItInstance) {
    markdownItInstance = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })

    // Add shiki plugin for syntax highlighting
    markdownItInstance.use(await shiki({
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    }))
  }
  return markdownItInstance
}

export function useMarkdown() {
  // Keep the original unified processor for compatibility
  const unifiedInstance = unified()
    .use(RemarkParse)
    .use(RemarkRehype)
    .use(RehypeStringify)

  return {
    process: async (markdown: string): Promise<string> => {
      try {
        const md = await getMarkdownItInstance()
        return md.render(markdown)
      }
      catch (error) {
        console.warn('Failed to process markdown with syntax highlighting, falling back to unified:', error)
        // Fallback to unified processor
        return unifiedInstance.processSync(markdown).toString()
      }
    },

    // Synchronous version for backward compatibility
    processSync: (markdown: string): string => {
      return unifiedInstance
        .processSync(markdown)
        .toString()
    },
  }
}
