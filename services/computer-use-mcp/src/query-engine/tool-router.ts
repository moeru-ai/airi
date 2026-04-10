/**
 * Tool router — maps LLM function call names to internal primitives.
 *
 * Each route receives parsed JSON arguments from the LLM's tool_call
 * and delegates to the appropriate CodingPrimitives method, terminal
 * runner, or web primitive.
 *
 * The router is intentionally simple — a flat map of name → async handler.
 * Adding a new tool requires only adding an entry here and exposing it
 * in the tool definitions returned by `getToolDefinitions()`.
 */

import type { CodingPrimitives } from '../coding/primitives'
import type { TerminalRunner } from '../types'
import type { QueryEngineTool } from './types'

import { webFetch } from '../web/primitives'

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>

export interface ToolRouterDeps {
  primitives: CodingPrimitives
  terminal: TerminalRunner
}

/**
 * Build the route table mapping tool names to handlers.
 */
export function buildToolRoutes(deps: ToolRouterDeps): Record<string, ToolHandler> {
  const { primitives, terminal } = deps

  return {
    read_file: async (args) => {
      return primitives.readFile(
        args.file_path as string,
        args.start_line as number | undefined,
        args.end_line as number | undefined,
      )
    },

    write_file: async (args) => {
      return primitives.writeFile(
        args.file_path as string,
        args.content as string,
      )
    },

    list_files: async (args) => {
      return primitives.listFiles({
        pattern: args.pattern as string | undefined,
        excludePatterns: args.exclude_patterns as string[] | undefined,
        maxResults: args.max_results as number | undefined,
      })
    },

    search_text: async (args) => {
      return primitives.searchText({
        query: args.query as string,
        filePattern: args.file_pattern as string | undefined,
        maxResults: args.max_results as number | undefined,
        caseSensitive: args.case_sensitive as boolean | undefined,
      })
    },

    bash: async (args) => {
      return terminal.execute({
        command: args.command as string,
        cwd: args.cwd as string | undefined,
        timeoutMs: args.timeout_ms as number | undefined,
      })
    },

    web_fetch: async (args) => {
      return webFetch({
        url: args.url as string,
        timeoutMs: args.timeout_ms as number | undefined,
        maxChars: args.max_chars as number | undefined,
      })
    },
  }
}

/**
 * Execute a tool call by name, returning a stringified result.
 * If the tool is unknown, returns an error result.
 */
export async function executeToolCall(
  routes: Record<string, ToolHandler>,
  toolName: string,
  argsJson: string,
): Promise<{ result: string; error: boolean }> {
  const handler = routes[toolName]
  if (!handler) {
    return {
      result: `Unknown tool: "${toolName}". Available tools: ${Object.keys(routes).join(', ')}`,
      error: true,
    }
  }

  let parsedArgs: Record<string, unknown>
  try {
    parsedArgs = JSON.parse(argsJson)
  }
  catch {
    return {
      result: `Invalid JSON arguments for tool "${toolName}": ${argsJson.slice(0, 200)}`,
      error: true,
    }
  }

  try {
    const result = await handler(parsedArgs)
    const serialized = typeof result === 'string' ? result : JSON.stringify(result, null, 2)

    // NOTICE: Cap individual tool results to 50k chars to prevent
    // context window bloat in multi-turn loops.
    const MAX_RESULT_CHARS = 50_000
    if (serialized.length > MAX_RESULT_CHARS) {
      const head = serialized.slice(0, 40_000)
      const tail = serialized.slice(-5_000)
      return {
        result: `${head}\n\n[... ${serialized.length - 45_000} characters omitted ...]\n\n${tail}`,
        error: false,
      }
    }

    return { result: serialized, error: false }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      result: `Tool "${toolName}" failed: ${message}`,
      error: true,
    }
  }
}

/**
 * Returns the OpenAI-compatible tool definitions for the query engine.
 * These are sent to the LLM as the `tools` parameter.
 */
export function getToolDefinitions(): QueryEngineTool[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Optionally specify a line range.',
      parameters: {
        type: 'object',
        required: ['file_path'],
        properties: {
          file_path: { type: 'string', description: 'Absolute or workspace-relative file path.' },
          start_line: { type: 'number', description: 'Start line (1-indexed, inclusive).' },
          end_line: { type: 'number', description: 'End line (1-indexed, inclusive).' },
        },
      },
    },
    {
      name: 'write_file',
      description: 'Create or overwrite a file with new content. Parent directories are created automatically.',
      parameters: {
        type: 'object',
        required: ['file_path', 'content'],
        properties: {
          file_path: { type: 'string', description: 'File path to write.' },
          content: { type: 'string', description: 'Full file content to write.' },
        },
      },
    },
    {
      name: 'list_files',
      description: 'List files in the workspace. Supports glob patterns.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match. Default: **/*' },
          exclude_patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to exclude.' },
          max_results: { type: 'number', description: 'Maximum results. Default: 200.' },
        },
      },
    },
    {
      name: 'search_text',
      description: 'Search for text patterns across the workspace using ripgrep.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query (regex or literal).' },
          file_pattern: { type: 'string', description: 'Glob pattern to limit search scope.' },
          max_results: { type: 'number', description: 'Maximum results. Default: 50.' },
          case_sensitive: { type: 'boolean', description: 'Case sensitive search. Default: true.' },
        },
      },
    },
    {
      name: 'bash',
      description: 'Execute a shell command. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'Shell command to execute.' },
          cwd: { type: 'string', description: 'Working directory override.' },
          timeout_ms: { type: 'number', description: 'Timeout in ms. Default: 30000.' },
        },
      },
    },
    {
      name: 'web_fetch',
      description: 'Fetch content from a URL. Converts HTML to text. No JavaScript execution.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', description: 'URL to fetch.' },
          timeout_ms: { type: 'number', description: 'Timeout in ms. Default: 15000.' },
          max_chars: { type: 'number', description: 'Max chars to return. Default: 50000.' },
        },
      },
    },
  ]
}
