import type { RegisterComputerUseToolsOptions } from './register-tools'

import { z } from 'zod'

import { webFetch, webSearch } from '../web/primitives'
import { textContent } from './content'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors'

export function registerWebTools(options: RegisterComputerUseToolsOptions) {
  const { server } = options

  // --- web_fetch ---
  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('web_fetch'),
    schema: {
      url: z.string().url().describe('URL to fetch content from. Must be http:// or https://.'),
      timeoutMs: z.number().int().min(1000).max(30000).optional().describe('Timeout in milliseconds. Default: 15000.'),
      maxChars: z.number().int().min(1000).max(100000).optional().describe('Maximum characters to return. Default: 50000.'),
    },
    handler: async ({ url, timeoutMs, maxChars }) => {
      const result = await webFetch({ url, timeoutMs, maxChars })

      const lines = [
        result.title ? `# ${result.title}` : `# ${result.url}`,
        `Status: ${result.statusCode} | Type: ${result.contentType} | ${result.textLength} chars${result.truncated ? ' (truncated)' : ''} | ${result.durationMs}ms`,
        '',
        result.text,
      ]

      return {
        content: [textContent(lines.join('\n'))],
        structuredContent: {
          status: 'ok',
          kind: 'web_fetch_result',
          ...result,
        },
      }
    },
  })

  // --- web_search ---
  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('web_search'),
    schema: {
      query: z.string().min(1).max(500).describe('Search query string.'),
      maxResults: z.number().int().min(1).max(20).optional().describe('Maximum results to return. Default: 10.'),
    },
    handler: async ({ query, maxResults }) => {
      const result = await webSearch({ query, maxResults })

      const lines = [
        `Search: "${result.query}" — ${result.totalResults} result(s)`,
      ]

      if (result.results.length > 0) {
        for (const r of result.results) {
          lines.push(`\n## ${r.title}`)
          lines.push(r.url)
          if (r.snippet) lines.push(r.snippet)
        }
      }

      if (result.note) {
        lines.push(`\n${result.note}`)
      }

      return {
        content: [textContent(lines.join('\n'))],
        structuredContent: {
          status: 'ok',
          kind: 'web_search_result',
          ...result,
        },
      }
    },
  })
}
