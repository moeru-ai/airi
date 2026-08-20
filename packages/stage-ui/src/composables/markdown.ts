import type { RehypeShikiOptions } from '@shikijs/rehype'
import type { Root, RootContent } from 'mdast'
import type { BundledLanguage } from 'shiki'
import type { Plugin, Processor } from 'unified'

import rehypeShiki from '@shikijs/rehype'
import rehypeKatex from 'rehype-katex'
import RehypeStringify from 'rehype-stringify'
import remarkMath from 'remark-math'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

// Define a specific, compatible type for our processor to ensure type safety.
type MarkdownProcessor = Processor<any, any, any, any, string>

const processorCache = new Map<string, Promise<MarkdownProcessor>>()
const langRegex = /```(.{2,})\s/g

function hasBalancedLatexGroups(value: string): boolean {
  let depth = 0

  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\') {
      index++
      continue
    }

    if (value[index] === '{') {
      depth++
    }
    else if (value[index] === '}') {
      depth--
      if (depth < 0)
        return false
    }
  }

  return depth === 0
}

function hasBalancedLatexDelimiters(value: string): boolean {
  let depth = 0

  for (const match of value.matchAll(/\\(left|right)\b/g)) {
    if (match[1] === 'left') {
      depth++
    }
    else {
      depth--
      if (depth < 0)
        return false
    }
  }

  return depth === 0
}

function hasStandaloneLatexRelation(value: string): boolean {
  const containsRelation = /[=<>]|\\(?:approx|cong|equiv|geq?|gt|leq?|lt|ne|neq|sim)\b/.test(value)
  const endsWithOperator = /(?:[-=<>+*/]|\\(?:approx|cdot|cong|div|equiv|geq?|gt|leq?|lt|mp|ne|neq|pm|sim|times))\s*$/.test(value)

  return containsRelation && !endsWithOperator
}

function isLatexContinuationLine(value: string): boolean {
  const startsWithGroupOrScript = ['{', '[', '_', '^'].includes(value[0] ?? '')
  const startsWithOperator = /^(?:[-=<>+*/]|\\(?:approx|cdot|cong|div|equiv|geq?|gt|leq?|lt|mp|ne|neq|pm|sim|times)\b)/.test(value)

  return startsWithGroupOrScript || startsWithOperator
}

function isIndependentEquationList(equations: string[]): boolean {
  return equations.length > 1
    && equations.every((equation, index) => (
      // Continuation syntax on later lines is not evidence of a standalone formula.
      (index === 0 || !isLatexContinuationLine(equation))
      && !/\\(?:begin|end)\s*\{/.test(equation)
      && !/\\(?:newcommand|renewcommand|providecommand|futurelet|[gex]?def|let)\b/.test(equation)
      && hasStandaloneLatexRelation(equation)
      && hasBalancedLatexGroups(equation)
      && hasBalancedLatexDelimiters(equation)
    ))
}

/**
 * Normalizes common chat output before Markdown becomes HTML.
 *
 * @example
 * A `latex` fence with two equation lines becomes two display-math nodes,
 * while `Price is $5 and cost is $10` stays text.
 */
const remarkChatMath: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file)

  visit(tree, 'code', (node, index, parent) => {
    if (index === undefined || !parent || !['latex', 'tex'].includes(node.lang?.toLowerCase() ?? ''))
      return

    const equations = node.value
      .split(/\r?\n/)
      .map(equation => equation.trim())
      .filter(Boolean)

    if (equations.length === 0)
      return

    // Chat models often put a list of independent equations in one LaTeX
    // fence. Only split positively identified equation lists; environments
    // and expressions continued across physical lines must stay intact.
    const mathValues = isIndependentEquationList(equations)
      ? equations
      : [node.value.trim()]
    const mathCodeNodes: RootContent[] = mathValues.map(value => ({
      type: 'code',
      lang: 'math',
      meta: null,
      value,
    }))

    parent.children.splice(index, 1, ...mathCodeNodes)
    return [SKIP, index + mathCodeNodes.length]
  })

  visit(tree, 'inlineMath', (node, index, parent) => {
    if (index === undefined || !parent)
      return

    const endOffset = node.position?.end.offset
    // Letter sequences can also be valid variables or units, so prose must
    // begin with an explicit connector between the two currency amounts.
    const isCurrencyBridge = /^\d[\d.,]*\s+(?:and|or|to)(?:\s+\p{L}+)*\s*$/iu.test(node.value)
      || /^\d[\d.,]*\s*[-–—]\s*$/u.test(node.value)
    const followedByAmount = endOffset !== undefined && /^\s*\d/.test(source.slice(endOffset))

    if (!isCurrencyBridge || !followedByAmount)
      return

    // remark-math pairs the dollar signs before two prices. Restore those
    // delimiters as text without disabling valid single-dollar equations.
    parent.children[index] = {
      type: 'text',
      value: `$${node.value}$`,
      position: node.position,
    }
  })
}

function extractLangs(markdown: string): BundledLanguage[] {
  const matches = markdown.matchAll(langRegex)
  const langs = new Set<BundledLanguage>()
  langs.add('python')
  for (const match of matches) {
    if (match[1])
      langs.add(match[1] as BundledLanguage)
  }
  return [...langs]
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
        tracerId: 'markdown',
        name: 'process.katex',
        ts: start,
        duration: performance.now() - start,
        meta: { length },
      })
    }
  }
}

async function createProcessor(langs: BundledLanguage[]): Promise<MarkdownProcessor> {
  const options: RehypeShikiOptions = {
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    langs,
    defaultLanguage: langs[0] || 'python',
  }

  return unified()
    .use(RemarkParse)
    .use(remarkMath)
    .use(remarkChatMath)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(rehypeShiki, options)
    .use(RehypeStringify)
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

export function useMarkdown() {
  const fallbackProcessor = unified()
    .use(RemarkParse)
    .use(remarkMath)
    .use(remarkChatMath)
    .use(RemarkRehype)
    .use(measuredKatex, { output: 'mathml' })
    .use(RehypeStringify)

  return {
    process: async (markdown: string): Promise<string> => {
      const hasCodeFence = /`{3,}/.test(markdown)
      const meta = { length: markdown.length, hasCodeFence }

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
