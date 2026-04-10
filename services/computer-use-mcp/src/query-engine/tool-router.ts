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
 * Detect if a bash command would modify files.
 * Returns the violation info if detected, null if the command is safe.
 *
 * This is a HARD system boundary — not a prompt suggestion.
 * All file writes must go through edit_file/multi_edit_file/write_file.
 */
export function detectBashWriteViolation(command: string): { pattern: string; target?: string } | null {
  // Normalize: collapse whitespace, strip leading/trailing
  const cmd = command.trim()

  // Patterns that ALWAYS indicate file mutation
  const WRITE_PATTERNS: Array<{ regex: RegExp; name: string }> = [
    { regex: /\bsed\s+.*-i/, name: 'sed -i (in-place edit)' },
    { regex: /\bperl\s+.*-[pi]/, name: 'perl -pi (in-place edit)' },
    { regex: /\bawk\s+.*-i\s+inplace/, name: 'awk -i inplace' },
    { regex: /(?:^|[|;])\s*cat\s.*>\s*\S/, name: 'cat > file (overwrite)' },
    { regex: /(?:^|[|;])\s*echo\s.*>\s*\S/, name: 'echo > file (overwrite)' },
    { regex: /(?:^|[|;])\s*printf\s.*>\s*\S/, name: 'printf > file (overwrite)' },
    { regex: />\s*(?!\/dev\/(?:null|stderr|stdout))\S/, name: '> file (redirect to file)' },
    { regex: /\btee\s+(?!.*\/dev\/)/, name: 'tee (write to file)' },
    { regex: /\bchmod\s/, name: 'chmod (change permissions)' },
    { regex: /\brm\s/, name: 'rm (delete files)' },
    { regex: /\brmdir\s/, name: 'rmdir (delete directory)' },
    { regex: /\bmv\s/, name: 'mv (move/rename files)' },
    { regex: /\bcp\s/, name: 'cp (copy files)' },
    { regex: /\bln\s/, name: 'ln (create links)' },
    { regex: /\btruncate\s/, name: 'truncate (truncate files)' },
    { regex: /\bdd\s/, name: 'dd (disk dump)' },
    { regex: /\bpatch\s/, name: 'patch (apply patches)' },
    { regex: /\bgit\s+(add|commit|reset|checkout|stash|merge|rebase|cherry-pick|revert)\b/, name: 'git write operation' },
    { regex: /\bpython[3]?\s+-c\s+.*open\s*\(.*['"]\s*w/, name: 'python write to file' },
    { regex: /\bnode\s+-e\s+.*writeFile/, name: 'node writeFile' },
  ]

  // Allowlist: commands that look like writes but are actually safe
  const SAFE_OVERRIDES = [
    />\s*\/dev\/null/,      // Redirecting to /dev/null is fine
    /2>\s*\/dev\/null/,     // stderr to /dev/null
    /2>&1/,                 // stderr to stdout
    /\bgit\s+(status|log|diff|show|branch|remote|describe|rev-parse|ls-files)\b/, // git read ops
    /\bgit\s+stash\s+list\b/, // git stash list is read-only
  ]

  // Check safe overrides first
  for (const safe of SAFE_OVERRIDES) {
    if (safe.test(cmd)) {
      // If the entire command matches a safe pattern, skip checking
      // But only if NO write pattern also matches beyond the safe part
    }
  }

  for (const { regex, name } of WRITE_PATTERNS) {
    if (regex.test(cmd)) {
      // Double-check it's not a safe override
      const isSafe = SAFE_OVERRIDES.some(safe => {
        // If the safe pattern explains the write pattern, it's fine
        // e.g., "echo foo 2>/dev/null" — the > is to /dev/null
        if (safe.test(cmd)) {
          // Remove the safe part and re-check
          const cleaned = cmd.replace(safe, '')
          return !regex.test(cleaned)
        }
        return false
      })

      if (!isSafe) {
        // Try to extract target file
        const targetMatch = cmd.match(/(?:>|tee|sed\s.*-i\s.*\s|cp\s.*\s|mv\s.*\s)(\S+)\s*$/)
        return { pattern: name, target: targetMatch?.[1] }
      }
    }
  }

  return null
}

/**
 * Apply a single search-and-replace edit to a file with LAYERED MATCHING.
 *
 * Match strategy (in order):
 * 1. Exact match
 * 2. Whitespace-normalized match (collapse runs of whitespace)
 * 3. Indent-normalized match (strip leading whitespace from both)
 * 4. Fuzzy window match (find the most similar contiguous block)
 *
 * On failure, returns the top 3 candidate snippets with similarity scores
 * so the agent can self-correct without re-reading the file.
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

  // ─── Layer 1: Exact match ───
  const exactIndex = content.indexOf(oldText)
  if (exactIndex !== -1) {
    const secondIndex = content.indexOf(oldText, exactIndex + oldText.length)
    if (secondIndex !== -1) {
      return {
        error: `old_text matches multiple locations in ${filePath}. Provide more context to make the match unique.`,
        firstMatch: `line ${content.slice(0, exactIndex).split('\n').length}`,
        secondMatch: `line ${content.slice(0, secondIndex).split('\n').length}`,
      }
    }
    return applyAndReport(fs, filePath, content, exactIndex, oldText, newText, 'exact')
  }

  // ─── Layer 2: Whitespace-normalized match ───
  const normalizeWS = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n')
  const contentNorm = normalizeWS(content)
  const oldNorm = normalizeWS(oldText)
  const wsIndex = contentNorm.indexOf(oldNorm)
  if (wsIndex !== -1) {
    // Find the actual position in original content by mapping back
    const actualRange = findOriginalRange(content, contentNorm, wsIndex, oldNorm.length)
    if (actualRange) {
      return applyAndReport(fs, filePath, content, actualRange.start,
        content.slice(actualRange.start, actualRange.end), newText, 'whitespace_normalized')
    }
  }

  // ─── Layer 3: Indent-normalized match ───
  const stripIndent = (s: string) => s.split('\n').map(l => l.trimStart()).join('\n')
  const contentStripped = stripIndent(content)
  const oldStripped = stripIndent(oldText)
  if (oldStripped.length > 10) {
    const indentIndex = contentStripped.indexOf(oldStripped)
    if (indentIndex !== -1) {
      const actualRange = findOriginalRange(content, contentStripped, indentIndex, oldStripped.length)
      if (actualRange) {
        return applyAndReport(fs, filePath, content, actualRange.start,
          content.slice(actualRange.start, actualRange.end), newText, 'indent_normalized')
      }
    }
  }

  // ─── Layer 4: Fuzzy window match — find the most similar block ───
  const candidates = findFuzzyCandidates(content, oldText, 3)

  if (candidates.length > 0 && candidates[0]!.similarity >= 0.7) {
    // High-confidence fuzzy match: report but DON'T auto-apply (agent must confirm)
    return {
      error: `Exact match not found. Found ${candidates.length} similar candidate(s).`,
      matchType: 'fuzzy_candidates',
      candidates: candidates.map(c => ({
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        similarity: `${Math.round(c.similarity * 100)}%`,
        snippet: c.text.length > 300 ? `${c.text.slice(0, 300)}...` : c.text,
      })),
      hint: 'Use the exact text from one of these candidates as old_text, or use start_line/end_line with read_file to see the full context.',
    }
  }

  // ─── Layer 5: Total failure — show file structure ───
  const lines = content.split('\n')
  const preview = lines.slice(0, Math.min(30, lines.length))
    .map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join('\n')

  return {
    error: `old_text not found in ${filePath}. No similar text found (file has ${lines.length} lines).`,
    hint: 'Read the file with read_file to see its current content, then use the exact text for old_text.',
    preview: preview.length > 2000 ? `${preview.slice(0, 2000)}\n[...]` : preview,
    ...(candidates.length > 0 ? {
      bestCandidate: {
        lineStart: candidates[0]!.lineStart,
        similarity: `${Math.round(candidates[0]!.similarity * 100)}%`,
        snippet: candidates[0]!.text.slice(0, 200),
      },
    } : {}),
  }
}

/**
 * Apply the edit and return a structured report with diff.
 */
async function applyAndReport(
  fs: typeof import('node:fs/promises'),
  filePath: string,
  content: string,
  index: number,
  actualOldText: string,
  newText: string,
  matchType: string,
): Promise<unknown> {
  const newContent = content.slice(0, index) + newText + content.slice(index + actualOldText.length)
  await fs.writeFile(filePath, newContent, 'utf-8')

  const lineNum = content.slice(0, index).split('\n').length
  const oldLines = actualOldText.split('\n').length
  const newLines = newText.split('\n').length
  return {
    success: true,
    file: filePath,
    matchType,
    line: lineNum,
    linesRemoved: oldLines,
    linesAdded: newLines,
    diff: `@@ -${lineNum},${oldLines} +${lineNum},${newLines} @@\n${actualOldText.split('\n').map(l => `-${l}`).join('\n')}\n${newText.split('\n').map(l => `+${l}`).join('\n')}`,
  }
}

/**
 * Map a position in a normalized string back to the original string.
 * Returns {start, end} in the original string, or null if mapping fails.
 */
function findOriginalRange(
  original: string,
  normalized: string,
  normIndex: number,
  normLength: number,
): { start: number; end: number } | null {
  // Build a character mapping from normalized to original positions
  // by walking both strings simultaneously
  let origPos = 0
  let normPos = 0
  let startOrig = -1
  let endOrig = -1

  // Simple heuristic: find line-based mapping
  const origLines = original.split('\n')
  const normLines = normalized.split('\n')

  if (origLines.length !== normLines.length) return null

  // Map normalized char position to line number
  let charCount = 0
  let startLine = -1
  let endLine = -1
  for (let i = 0; i < normLines.length; i++) {
    if (startLine === -1 && charCount + normLines[i]!.length >= normIndex) {
      startLine = i
    }
    charCount += normLines[i]!.length + 1 // +1 for \n
    if (charCount >= normIndex + normLength) {
      endLine = i
      break
    }
  }

  if (startLine === -1) return null
  if (endLine === -1) endLine = origLines.length - 1

  // Get the original text for those lines
  const beforeStart = origLines.slice(0, startLine).join('\n')
  const matchedLines = origLines.slice(startLine, endLine + 1).join('\n')
  const start = beforeStart.length + (startLine > 0 ? 1 : 0)

  return { start, end: start + matchedLines.length }
}

/**
 * Find the top-N most similar contiguous blocks in content compared to target.
 * Uses a sliding-window approach with line-level Jaccard similarity.
 */
function findFuzzyCandidates(
  content: string,
  target: string,
  maxCandidates: number,
): Array<{ lineStart: number; lineEnd: number; similarity: number; text: string }> {
  const contentLines = content.split('\n')
  const targetLines = target.split('\n')
  const targetLen = targetLines.length
  const targetTokens = new Set(targetLines.flatMap(l => l.trim().split(/\s+/).filter(Boolean)))

  if (targetTokens.size === 0) return []

  const candidates: Array<{ lineStart: number; lineEnd: number; similarity: number; text: string }> = []

  // Slide a window of targetLen lines over the content
  const windowSize = Math.max(targetLen, 3)
  for (let i = 0; i <= contentLines.length - windowSize; i++) {
    const windowLines = contentLines.slice(i, i + windowSize)
    const windowTokens = new Set(windowLines.flatMap(l => l.trim().split(/\s+/).filter(Boolean)))

    // Jaccard similarity
    let intersection = 0
    for (const t of targetTokens) {
      if (windowTokens.has(t)) intersection++
    }
    const union = targetTokens.size + windowTokens.size - intersection
    const similarity = union > 0 ? intersection / union : 0

    if (similarity > 0.3) {
      candidates.push({
        lineStart: i + 1,
        lineEnd: i + windowSize,
        similarity,
        text: windowLines.join('\n'),
      })
    }
  }

  // Sort by similarity descending, take top N
  candidates.sort((a, b) => b.similarity - a.similarity)

  // Deduplicate overlapping ranges
  const filtered: typeof candidates = []
  for (const c of candidates) {
    if (filtered.length >= maxCandidates) break
    const overlaps = filtered.some(f =>
      (c.lineStart >= f.lineStart && c.lineStart <= f.lineEnd)
      || (c.lineEnd >= f.lineStart && c.lineEnd <= f.lineEnd),
    )
    if (!overlaps) filtered.push(c)
  }

  return filtered
}

/**
 * Build the route table mapping tool names to handlers.
 */
export function buildToolRoutes(deps: ToolRouterDeps): Record<string, ToolHandler> {
  const { primitives, terminal, workspacePath } = deps

  /**
   * Resolve a file path: if relative, resolve against workspacePath.
   */
  const resolveFilePath = async (filePath: string): Promise<string> => {
    const pathMod = await import('node:path')
    return pathMod.isAbsolute(filePath) ? filePath : pathMod.join(workspacePath, filePath)
  }

  return {
    read_file: async (args) => {
      const filePath = await resolveFilePath(args.file_path as string)
      const startLine = args.start_line as number | undefined
      const endLine = args.end_line as number | undefined

      // Read the raw content
      let content: string
      let totalLines: number
      try {
        const result = await primitives.readFile(filePath, startLine, endLine)
        content = typeof result === 'string' ? result : result.content
        totalLines = typeof result === 'string' ? content.split('\n').length : result.totalLines
      }
      catch {
        // Fallback: direct fs read
        const fs = await import('node:fs/promises')
        const raw = await fs.readFile(filePath, 'utf8')
        const allLines = raw.split('\n')
        totalLines = allLines.length

        if (startLine || endLine) {
          const s = Math.max(1, startLine ?? 1)
          const e = Math.min(totalLines, endLine ?? totalLines)
          content = allLines.slice(s - 1, e).join('\n')
        }
        else {
          content = raw
        }
      }

      // Large file strategy: if no range was requested and the file is large,
      // return first + last lines with a navigation hint.
      const MAX_LINES_NO_RANGE = 500
      const lines = content.split('\n')

      if (!startLine && !endLine && lines.length > MAX_LINES_NO_RANGE) {
        const HEAD_LINES = 200
        const TAIL_LINES = 100
        const omitted = lines.length - HEAD_LINES - TAIL_LINES

        // Prepend line numbers for navigation
        const headWithNums = lines.slice(0, HEAD_LINES)
          .map((l, i) => `${String(i + 1).padStart(5)}  ${l}`).join('\n')
        const tailStart = lines.length - TAIL_LINES
        const tailWithNums = lines.slice(tailStart)
          .map((l, i) => `${String(tailStart + i + 1).padStart(5)}  ${l}`).join('\n')

        return {
          path: filePath,
          totalLines,
          truncated: true,
          content: `${headWithNums}\n\n... [${omitted} lines omitted — use start_line/end_line to read specific sections] ...\n\n${tailWithNums}`,
          hint: `File has ${totalLines} lines. Showing lines 1-${HEAD_LINES} and ${tailStart + 1}-${totalLines}. Use start_line/end_line to read the middle.`,
        }
      }

      // For small files or ranged reads, add line numbers
      const baseLineNum = startLine ?? 1
      const numbered = lines
        .map((l, i) => `${String(baseLineNum + i).padStart(5)}  ${l}`)
        .join('\n')

      return {
        path: filePath,
        totalLines,
        content: numbered,
      }
    },

    write_file: async (args) => {
      const filePath = await resolveFilePath(args.file_path as string)
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
      const command = args.command as string

      // NOTICE: System-level guard — bash MUST NOT modify files.
      // File modifications must go through edit_file/multi_edit_file/write_file
      // so they are tracked, verified, and reversible.
      const violation = detectBashWriteViolation(command)
      if (violation) {
        return {
          error: true,
          blocked: true,
          message: `BLOCKED: bash command would modify files (${violation.pattern}).`,
          hint: `Use edit_file or multi_edit_file to modify "${violation.target || 'files'}". `
            + 'bash is only allowed for: reading, searching, compiling, testing, linting, and git queries.',
        }
      }

      return terminal.execute({
        command,
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
      const filePath = await resolveFilePath(args.file_path as string)
      const oldText = args.old_text as string
      const newText = args.new_text as string
      return applySingleEdit(filePath, oldText, newText)
    },

    multi_edit_file: async (args) => {
      const filePath = await resolveFilePath(args.file_path as string)
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
      description: 'Read the contents of a file with line numbers. '
        + 'For files over 500 lines, only the first 200 and last 100 lines are shown unless start_line/end_line are specified. '
        + 'Use start_line and end_line to read specific sections of large files.',
      parameters: {
        type: 'object',
        required: ['file_path'],
        properties: {
          file_path: { type: 'string', description: 'Absolute or workspace-relative file path.' },
          start_line: { type: 'number', description: 'Start line (1-indexed, inclusive). Use to read specific sections of large files.' },
          end_line: { type: 'number', description: 'End line (1-indexed, inclusive). Use to read specific sections of large files.' },
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
