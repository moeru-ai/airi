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
  workspacePath: string
}

/**
 * Apply a single search-and-replace edit to a file.
 * Shared by edit_file (single edit) and used as a building block.
 */
async function applySingleEdit(filePath: string, oldText: string, newText: string): Promise<unknown> {
  const fs = await import('node:fs/promises')

  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  }
  catch {
    return { error: `File not found: ${filePath}. Use write_file to create new files.` }
  }

  const index = content.indexOf(oldText)
  if (index === -1) {
    const lines = content.split('\n')
    const preview = lines.slice(0, Math.min(40, lines.length)).join('\n')
    return {
      error: `old_text not found in ${filePath}. File has ${lines.length} lines.`,
      hint: 'Make sure old_text matches the file content exactly, including whitespace and indentation.',
      preview: preview.length > 2000 ? `${preview.slice(0, 2000)}\n[...]` : preview,
    }
  }

  const secondIndex = content.indexOf(oldText, index + oldText.length)
  if (secondIndex !== -1) {
    return {
      error: `old_text matches multiple locations in ${filePath}. Provide more context to make the match unique.`,
      firstMatch: `line ${content.slice(0, index).split('\n').length}`,
      secondMatch: `line ${content.slice(0, secondIndex).split('\n').length}`,
    }
  }

  const newContent = content.slice(0, index) + newText + content.slice(index + oldText.length)
  await fs.writeFile(filePath, newContent, 'utf-8')

  const lineNum = content.slice(0, index).split('\n').length
  const oldLines = oldText.split('\n').length
  const newLines = newText.split('\n').length
  return {
    success: true,
    file: filePath,
    line: lineNum,
    linesRemoved: oldLines,
    linesAdded: newLines,
    diff: `@@ -${lineNum},${oldLines} +${lineNum},${newLines} @@\n${oldText.split('\n').map(l => `-${l}`).join('\n')}\n${newText.split('\n').map(l => `+${l}`).join('\n')}`,
  }
}

/**
 * Build the route table mapping tool names to handlers.
 */
export function buildToolRoutes(deps: ToolRouterDeps): Record<string, ToolHandler> {
  const { primitives, terminal, workspacePath } = deps

  /**
   * Resolve a file path: if relative, resolve against workspacePath.
   */
  const resolveFilePath = (filePath: string): string => {
    const pathMod = require('node:path') as typeof import('node:path')
    return pathMod.isAbsolute(filePath) ? filePath : pathMod.join(workspacePath, filePath)
  }

  return {
    read_file: async (args) => {
      const filePath = resolveFilePath(args.file_path as string)
      try {
        return await primitives.readFile(
          filePath,
          args.start_line as number | undefined,
          args.end_line as number | undefined,
        )
      }
      catch {
        // Fallback: direct fs read
        const fs = await import('node:fs/promises')
        const content = await fs.readFile(filePath, 'utf8')
        return { content, path: filePath, totalLines: content.split('\n').length }
      }
    },

    write_file: async (args) => {
      const filePath = resolveFilePath(args.file_path as string)
      const content = args.content as string
      try {
        return await primitives.writeFile(filePath, content)
      }
      catch {
        // Fallback: direct fs write when runtime is not fully initialized
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(filePath, content, 'utf8')
        return { written: true, absolutePath: filePath, bytesWritten: Buffer.byteLength(content, 'utf8'), created: true }
      }
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

    edit_file: async (args) => {
      const filePath = resolveFilePath(args.file_path as string)
      const oldText = args.old_text as string
      const newText = args.new_text as string
      return applySingleEdit(filePath, oldText, newText)
    },

    multi_edit_file: async (args) => {
      const filePath = resolveFilePath(args.file_path as string)
      const edits = args.edits as Array<{ old_text: string; new_text: string }>

      if (!Array.isArray(edits) || edits.length === 0) {
        return { error: 'edits must be a non-empty array of { old_text, new_text } objects.' }
      }

      // Read file once
      let content: string
      try {
        const fs = await import('node:fs/promises')
        content = await fs.readFile(filePath, 'utf-8')
      }
      catch {
        return { error: `File not found: ${filePath}. Use write_file to create new files.` }
      }

      // Apply edits sequentially, validating each one
      const applied: Array<{ line: number; linesRemoved: number; linesAdded: number }> = []
      const errors: string[] = []

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i]!
        const index = content.indexOf(edit.old_text)
        if (index === -1) {
          errors.push(`Edit ${i + 1}: old_text not found. Searched for: ${JSON.stringify(edit.old_text.slice(0, 80))}`)
          continue
        }

        // Check for multiple matches
        const secondIndex = content.indexOf(edit.old_text, index + edit.old_text.length)
        if (secondIndex !== -1) {
          errors.push(`Edit ${i + 1}: old_text matches multiple locations (lines ${content.slice(0, index).split('\n').length} and ${content.slice(0, secondIndex).split('\n').length}). Provide more context.`)
          continue
        }

        const lineNum = content.slice(0, index).split('\n').length
        content = content.slice(0, index) + edit.new_text + content.slice(index + edit.old_text.length)
        applied.push({
          line: lineNum,
          linesRemoved: edit.old_text.split('\n').length,
          linesAdded: edit.new_text.split('\n').length,
        })
      }

      if (applied.length === 0) {
        const lines = content.split('\n')
        return {
          error: `No edits could be applied. ${errors.join(' | ')}`,
          hint: 'Make sure each old_text matches the current file content exactly.',
          preview: lines.slice(0, 40).join('\n').slice(0, 2000),
        }
      }

      // Write back
      const fs = await import('node:fs/promises')
      await fs.writeFile(filePath, content, 'utf-8')

      return {
        success: true,
        file: filePath,
        editsApplied: applied.length,
        editsTotal: edits.length,
        editsFailed: errors.length,
        details: applied,
        ...(errors.length > 0 ? { errors } : {}),
      }
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
    {
      name: 'edit_file',
      description: 'Make a precise edit to an existing file by replacing old_text with new_text. '
        + 'old_text must match the file content EXACTLY (including whitespace). '
        + 'Use this instead of write_file when modifying existing files — it is safer and preserves unchanged content. '
        + 'For multiple edits to the same file, use multi_edit_file instead.',
      parameters: {
        type: 'object',
        required: ['file_path', 'old_text', 'new_text'],
        properties: {
          file_path: { type: 'string', description: 'File path to edit.' },
          old_text: { type: 'string', description: 'Exact text to find and replace. Must match file content exactly.' },
          new_text: { type: 'string', description: 'Replacement text.' },
        },
      },
    },
    {
      name: 'multi_edit_file',
      description: 'Apply multiple edits to a single file in one operation. '
        + 'Each edit replaces old_text with new_text. Edits are applied sequentially '
        + 'so later edits see the result of earlier ones. '
        + 'Use this when you need to change multiple non-adjacent sections of the same file.',
      parameters: {
        type: 'object',
        required: ['file_path', 'edits'],
        properties: {
          file_path: { type: 'string', description: 'File path to edit.' },
          edits: {
            type: 'array',
            description: 'Array of edits to apply.',
            items: {
              type: 'object',
              required: ['old_text', 'new_text'],
              properties: {
                old_text: { type: 'string', description: 'Exact text to find.' },
                new_text: { type: 'string', description: 'Replacement text.' },
              },
            },
          },
        },
      },
    },
  ]
}
