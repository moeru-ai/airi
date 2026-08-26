import type { RehypeShikiOptions } from '@shikijs/rehype'
import type { BundledLanguage } from 'shiki'
import type { Processor } from 'unified'

import rehypeShiki from '@shikijs/rehype'
import rehypeKatex from 'rehype-katex'
import RehypeStringify from 'rehype-stringify'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

import { chatMathPreset, isChatMathFenceLanguage } from './chat-math'

// Define a specific, compatible type for our processor to ensure type safety.
type MarkdownProcessor = Processor<any, any, any, any, string>

const processorCache = new Map<string, Promise<MarkdownProcessor>>()
// The rich path parses once for language discovery so info strings and fences
// inside blockquotes or nested lists follow Remark rules instead of a regex.
const languageParser = unified()
  .use(RemarkParse)
  .use(chatMathPreset)

export function useMarkdown() {
  const fallbackProcessor = unified()
    .use(RemarkParse)
    .use(chatMathPreset)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(RehypeStringify)

  return {
    process: async (markdown: string): Promise<string> => {
      const hasCodeFence = /`{3,}/.test(markdown)
      const meta = { hasCodeFence, length: markdown.length }

      return defaultPerfTracer.withMeasure('markdown', 'process', async () => {
        try {
          // A quick check for code fences. If none, use the fast fallback.
          if (!hasCodeFence) {
            return defaultPerfTracer.withMeasure('markdown', 'process.pipeline.basic', () => {
              return fallbackProcessor.processSync(markdown).toString()
            }, meta)
          }

          const langs = extractLangs(markdown)

          // Always ensure 'python' is loaded as it's our default.
          const langSet = new Set(langs)
          langSet.add('python')
          const languagesToLoad = Array.from(langSet)

          const processor = await getProcessor(languagesToLoad)
          const result = await defaultPerfTracer.withMeasure('markdown', 'process.pipeline.rich', () => processor.process(markdown), meta)
          return result.toString()
        }
        catch (error) {
          console.warn(
            'Failed to process markdown with syntax highlighting, falling back to basic processing:',
            error,
          )
          // Fallback to basic processor without highlighting
          return defaultPerfTracer.withMeasure('markdown', 'process.pipeline.fallback', () => {
            return fallbackProcessor.processSync(markdown).toString()
          }, { ...meta, fallback: true })
        }
      }, meta)
    },

    // Synchronous version for backward compatibility
    processSync: (markdown: string): string => {
      const start = performance.now()
      const output = fallbackProcessor
        .processSync(markdown)
        .toString()

      defaultPerfTracer.emit({
        duration: performance.now() - start,
        meta: { length: markdown.length },
        name: 'process.pipeline.sync',
        tracerId: 'markdown',
        ts: start,
      })

      return output
    },
  }
}

async function createProcessor(langs: BundledLanguage[]): Promise<MarkdownProcessor> {
  const options: RehypeShikiOptions = {
    defaultLanguage: langs[0] || 'python',
    langs,
    themes: {
      dark: 'github-dark',
      light: 'github-light',
    },
  }

  return unified()
    .use(RemarkParse)
    .use(chatMathPreset)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(rehypeShiki, options)
    .use(RehypeStringify)
}

function extractLangs(markdown: string): BundledLanguage[] {
  const tree = languageParser.parse(markdown)
  const langs = new Set<BundledLanguage>()
  langs.add('python')
  visit(tree, 'code', (node) => {
    if (node.lang && !isChatMathFenceLanguage(node.lang))
      langs.add(node.lang as BundledLanguage)
  })
  return [...langs]
}

function getProcessor(langs: BundledLanguage[]): Promise<MarkdownProcessor> {
  // The cache key should be consistent, so we sort the languages.
  const cacheKey = [...langs].sort().join(',')

  if (!processorCache.has(cacheKey)) {
    const processorPromise = createProcessor(langs)
    processorCache.set(cacheKey, processorPromise)
  }

  return processorCache.get(cacheKey)!
}

function measuredKatex(options?: Parameters<typeof rehypeKatex>[0]) {
  const transform = rehypeKatex(options)
  return (tree: any, file: any) => {
    const start = performance.now()
    const length = typeof file?.value === 'string' ? file.value.length : undefined
    try {
      return transform(tree, file)
    }
    finally {
      defaultPerfTracer.emit({
        duration: performance.now() - start,
        meta: { length },
        name: 'process.katex',
        tracerId: 'markdown',
        ts: start,
      })
    }
  }
}
