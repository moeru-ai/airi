import type { RehypeShikiOptions } from '@shikijs/rehype'
import type { BundledLanguage } from 'shiki'
import type { Root } from 'hast'

import rehypeShiki from '@shikijs/rehype'
import rehypeKatex from 'rehype-katex'
import RehypeStringify from 'rehype-stringify'
import remarkMath from 'remark-math'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { unified } from 'unified'

/** Minimal VFile interface for unified ecosystem — only properties used by this composable */
interface VFile {
  value?: string | Uint8Array
}

/** Rehype transform function type produced by rehype plugins such as rehype-katex */
type RehypeTransform = (tree: Root, file: VFile) => undefined

/**
 * Minimal processor interface wrapping a unified Processor.
 * Only exposes the methods used by this composable, avoiding the complex
 * generic invariant types from unified's Processor class.
 */
interface MarkdownProcessor {
  processSync: (markdown: string) => VFile
  process: (markdown: string) => Promise<VFile>
}

const processorCache = new Map<string, Promise<MarkdownProcessor>>()
const langRegex = /```(.{2,})\s/g

function extractLangs(markdown: string): BundledLanguage[] {
  const matches = markdown.matchAll(langRegex)
  const langs = new Set<BundledLanguage>()
  langs.add('python')
  for (const match of matches) {
    if (match[1]) langs.add(match[1] as BundledLanguage)
  }
  return [...langs]
}

function measuredKatex(options?: Parameters<typeof rehypeKatex>[0]): RehypeTransform {
  const transform = rehypeKatex(options)
  return (tree: Root, file: VFile) => {
    const start = performance.now()
    const length = typeof file.value === 'string' ? file.value.length : undefined
    try {
      return transform(tree, file as Parameters<typeof transform>[1])
    } finally {
      defaultPerfTracer.emit({
        tracerId: 'markdown',
        name: 'process.katex',
        ts: start,
        duration: performance.now() - start,
        meta: { length },
      })
    }
  }
}

function createProcessor(langs: BundledLanguage[]): MarkdownProcessor {
  const options: RehypeShikiOptions = {
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    langs,
    defaultLanguage: langs[0] || 'python',
  }

  const processor = unified()
    .use(RemarkParse)
    .use(remarkMath)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(rehypeShiki, options)
    .use(RehypeStringify)

  return {
    processSync: (markdown: string) => processor.processSync(markdown) as VFile,
    process: (markdown: string) => processor.process(markdown) as Promise<VFile>,
  }
}

function getProcessor(langs: BundledLanguage[]): Promise<MarkdownProcessor> {
  // The cache key should be consistent, so we sort the languages.
  const cacheKey = [...langs].sort().join(',')

  if (!processorCache.has(cacheKey)) {
    const processorPromise = new Promise<MarkdownProcessor>((resolve) => {
      // The processor is created synchronously, but wrapping in a promise
      // allows the cache to store the result for future calls.
      resolve(createProcessor(langs))
    })
    processorCache.set(cacheKey, processorPromise)
  }

  return processorCache.get(cacheKey)!
}

export function useMarkdown() {
  const fallbackProcessor = unified()
    .use(RemarkParse)
    .use(remarkMath)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(RehypeStringify)

  return {
    process: async (markdown: string): Promise<string> => {
      const hasCodeFence = /`{3,}/.test(markdown)
      const meta = { length: markdown.length, hasCodeFence }

      return defaultPerfTracer.withMeasure(
        'markdown',
        'process',
        async () => {
          try {
            // A quick check for code fences. If none, use the fast fallback.
            if (!hasCodeFence) {
              return defaultPerfTracer.withMeasure(
                'markdown',
                'process.pipeline.basic',
                () => {
                  return fallbackProcessor.processSync(markdown).toString()
                },
                meta,
              )
            }

            const langs = extractLangs(markdown)

            // Always ensure 'python' is loaded as it's our default.
            const langSet = new Set(langs)
            langSet.add('python')
            const languagesToLoad = Array.from(langSet)

            const processor = await getProcessor(languagesToLoad)
            const result = await defaultPerfTracer.withMeasure(
              'markdown',
              'process.pipeline.rich',
              () => processor.process(markdown),
              meta,
            )
            return result.toString()
          } catch (error) {
            console.warn(
              'Failed to process markdown with syntax highlighting, falling back to basic processing:',
              error,
            )
            // Fallback to basic processor without highlighting
            return defaultPerfTracer.withMeasure(
              'markdown',
              'process.pipeline.fallback',
              () => {
                return fallbackProcessor.processSync(markdown).toString()
              },
              { ...meta, fallback: true },
            )
          }
        },
        meta,
      )
    },

    // Synchronous version for backward compatibility
    processSync: (markdown: string): string => {
      const start = performance.now()
      const output = fallbackProcessor.processSync(markdown).toString()

      defaultPerfTracer.emit({
        tracerId: 'markdown',
        name: 'process.pipeline.sync',
        ts: start,
        duration: performance.now() - start,
        meta: { length: markdown.length },
      })

      return output
    },
  }
}
