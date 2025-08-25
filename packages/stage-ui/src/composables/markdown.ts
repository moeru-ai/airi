import rehypeShiki from '@shikijs/rehype'
import RehypeStringify from 'rehype-stringify'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { unified } from 'unified'

async function createProcessor() {
  return unified()
    .use(RemarkParse)
    .use(RemarkRehype)
    .use(rehypeShiki, {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    })
    .use(RehypeStringify)
}

export function useMarkdown() {
  const fallbackProcessor = unified()
    .use(RemarkParse)
    .use(RemarkRehype)
    .use(RehypeStringify)

  return {
    process: async (markdown: string): Promise<string> => {
      try {
        const processor = await createProcessor()
        const result = await processor.process(markdown)
        return result.toString()
      }
      catch (error) {
        console.warn('Failed to process markdown with syntax highlighting, falling back to basic processing:', error)
        // Fallback to basic processor without highlighting
        return fallbackProcessor.processSync(markdown).toString()
      }
    },

    // Synchronous version for backward compatibility
    processSync: (markdown: string): string => {
      return fallbackProcessor
        .processSync(markdown)
        .toString()
    },
  }
}
