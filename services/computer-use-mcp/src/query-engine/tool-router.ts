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

import { findReferences, searchSymbol } from '../coding/search'
import { webFetch } from '../web/primitives'
import { applySingleEdit, buildDiffPreview, extractOutline, findUndocumentedExports } from './edit-engine'
import { getDiagnostics } from './navigation'

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
export function detectBashWriteViolation(command: string): { pattern: string, target?: string } | null {
  // Normalize: collapse whitespace, strip leading/trailing
  const cmd = command.trim()

  // Patterns that ALWAYS indicate file mutation
  const WRITE_PATTERNS: Array<{ regex: RegExp, name: string }> = [
    { regex: /\bsed\s+(?:\S.*)?-i/, name: 'sed -i (in-place edit)' },
    { regex: /\bperl\s+(?:\S.*)?-[pi]/, name: 'perl -pi (in-place edit)' },
    { regex: /\bawk\s+(?:\S.*)?-i\s+inplace/, name: 'awk -i inplace' },
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
    { regex: /\bpython3?\s+-c\s+(?:\S.*)?open\s*\(.*['"]\s*w/, name: 'python write to file' },
    { regex: /\bnode\s+-e\s+(?:\S.*)?writeFile/, name: 'node writeFile' },
  ]

  // Allowlist: commands that look like writes but are actually safe
  const SAFE_OVERRIDES = [
    />\s*\/dev\/null/, // Redirecting to /dev/null is fine
    /2>\s*\/dev\/null/, // stderr to /dev/null
    /2>&1/, // stderr to stdout
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
      const isSafe = SAFE_OVERRIDES.some((safe) => {
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
 * Detect if a bash command is naively being used for target discovery.
 * Returns the violation message if detected, null if the command is allowed.
 *
 * This prevents the AI from falling into a retry loop executing `bash > find`
 * instead of using the native structured tools.
 */
export function detectBashDiscoveryViolation(command: string): string | null {
  const cmd = command.trim()

  // Block basic read commands not chained/piped
  if (/^\s*(cat|less|more|head|tail)\b/.test(cmd)) {
    return 'Use read_file tool to read file contents'
  }

  // Block naive discovery
  if (/^\s*(find|ls|tree|fd)\b/.test(cmd)) {
    return 'Use list_files tool for file discovery'
  }

  // Block text search
  if (/^\s*(grep|rg|ag|ack|xargs\s+grep)\b/.test(cmd)) {
    return 'Use search_text tool to search across files'
  }

  return null
}

// ─── Edit logic extracted to edit-engine.ts ───

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
        // NOTICE: primitives.readFile returns a string, not an object.
        content = result
        totalLines = content.split('\n').length
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
      // return first + last lines with a navigation hint AND a structural outline.
      const MAX_LINES_NO_RANGE = 500
      const lines = content.split('\n')

      if (!startLine && !endLine && lines.length > MAX_LINES_NO_RANGE) {
        const HEAD_LINES = 200
        const TAIL_LINES = 100
        const omitted = lines.length - HEAD_LINES - TAIL_LINES

        // Prepend line numbers for navigation
        const headWithNums = lines.slice(0, HEAD_LINES)
          .map((l, i) => `${String(i + 1).padStart(5)}  ${l}`)
          .join('\n')
        const tailStart = lines.length - TAIL_LINES
        const tailWithNums = lines.slice(tailStart)
          .map((l, i) => `${String(tailStart + i + 1).padStart(5)}  ${l}`)
          .join('\n')

        // NOTICE: Generate a structural outline for large files.
        // This helps the agent find exported functions/types/classes
        // without reading the entire file, so it knows where to
        // request start_line/end_line for targeted reads.
        const outline = extractOutline(lines)
        const outlineSection = outline.length > 0
          ? `\n\n## File Outline (exported symbols)\n${outline.map(e => `  L${String(e.line).padStart(5)}: ${e.kind} ${e.name}`).join('\n')}`
          : ''

        // NOTICE: Attach undocumented export metadata for doc tasks.
        // Only for TS/JS/Python files — avoids noise on config files etc.
        const docMeta = isDocCandidateFile(filePath)
          ? buildDocCandidateMeta(lines)
          : undefined

        return {
          path: filePath,
          totalLines,
          truncated: true,
          content: `${headWithNums}\n\n... [${omitted} lines omitted — use start_line/end_line to read specific sections] ...\n\n${tailWithNums}${outlineSection}`,
          hint: `File has ${totalLines} lines. Showing lines 1-${HEAD_LINES} and ${tailStart + 1}-${totalLines}. ${outline.length} exported symbols found in outline. Use start_line/end_line to read specific sections.`,
          ...docMeta,
        }
      }

      // For small files or ranged reads, add line numbers
      const baseLineNum = startLine ?? 1
      const numbered = lines
        .map((l, i) => `${String(baseLineNum + i).padStart(5)}  ${l}`)
        .join('\n')

      // Attach undocumented exports for small TS/JS/Python files (full read)
      const docMeta = (!startLine && !endLine && isDocCandidateFile(filePath))
        ? buildDocCandidateMeta(lines)
        : undefined

      return {
        path: filePath,
        totalLines,
        content: numbered,
        ...docMeta,
      }
    },

    write_file: async (args) => {
      const filePath = await resolveFilePath(args.file_path as string)
      const content = args.content as string
      const overwrite = args.overwrite as boolean | undefined

      const fs = await import('node:fs/promises')
      let fileExists = false
      try {
        await fs.access(filePath)
        fileExists = true
      }
      catch { /* file doesn't exist, OK to create */ }

      // NOTICE: HARD rejection of overwrites on existing files.
      // Previously this was a warning string appended to the result, but LLMs
      // routinely ignore warnings in tool results. A 500-line file getting
      // replaced by 20 lines of "improved" content is an unrecoverable data loss.
      // The agent MUST use edit_file for existing files, or set overwrite: true.
      if (fileExists && !overwrite) {
        return {
          error: true,
          message: `BLOCKED: "${filePath}" already exists. `
            + 'Use edit_file to modify existing files (it preserves unchanged content). '
            + 'write_file is for creating NEW files only. '
            + 'If you truly need to replace the entire file, set overwrite: true.',
        }
      }

      let result: any
      try {
        result = await primitives.writeFile(filePath, content)
      }
      catch {
        const path = await import('node:path')
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(filePath, content, 'utf8')
        result = { written: true, absolutePath: filePath, bytesWritten: Buffer.byteLength(content, 'utf8'), created: !fileExists }
      }

      return result
    },

    list_files: async (args) => {
      return primitives.listFiles({
        pattern: args.pattern as string | undefined,
        excludePatterns: args.exclude_patterns as string[] | undefined,
        maxResults: args.max_results as number | undefined,
      })
    },

    search_text: async (args) => {
      // NOTICE: primitives.searchText takes positional args, not an object.
      return primitives.searchText(
        args.query as string,
        undefined, // targetPath — search_text tool doesn't expose this
        args.file_pattern as string | undefined,
        args.max_results as number | undefined,
      )
    },

    search_symbol: async (args) => {
      const result = await searchSymbol(
        workspacePath,
        String(args.symbol_name),
        {
          searchRoot: args.target_path ? String(args.target_path) : workspacePath,
          glob: args.file_pattern ? String(args.file_pattern) : undefined,
        },
      )
      // Cap the snippet lengths to avoid massive context
      if (result.matches && Array.isArray(result.matches)) {
        result.matches = result.matches.map((m: any) => ({
          ...m,
          snippet: m.snippet && m.snippet.length > 200 ? `${m.snippet.slice(0, 200)}...` : m.snippet,
        }))
      }
      return result
    },

    find_references: async (args) => {
      return findReferences(
        workspacePath,
        String(args.file_path),
        Number(args.line),
        Number(args.column),
      )
    },

    get_diagnostics: async (args) => {
      return getDiagnostics(workspacePath, String(args.file_path))
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

      // NOTICE: Prevent simple discovery bash loops (Stupidity Event: S2/S4 fail modes)
      const discoveryViolation = detectBashDiscoveryViolation(command)
      if (discoveryViolation) {
        return {
          error: true,
          blocked: true,
          message: `BLOCKED: Do not use bash for simple file discovery/reading.`,
          hint: discoveryViolation,
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
      const startLine = args.start_line as number | undefined
      const endLine = args.end_line as number | undefined
      const result = await applySingleEdit(filePath, oldText, newText, startLine, endLine)

      // Diff preview: show what changed
      if (typeof result === 'object' && (result as any).success) {
        const diffPreview = buildDiffPreview(oldText, newText)
        return { ...result as object, diff_preview: diffPreview }
      }
      return result
    },

    multi_edit_file: async (args) => {
      const filePath = await resolveFilePath(args.file_path as string)
      const edits = args.edits as Array<{ old_text: string, new_text: string }>

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

      // NOTICE: Layered matching for multi_edit_file — consistent with edit_file.
      // Tries exact → whitespace-normalized → quote-normalized → indent-normalized.
      // Returns the index and actual matched text in the original content.
      const normalizeWS = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n')
      const normalizeQuotes = (s: string) =>
        s.replace(/[\u2018\u2019\u201A\u2039\u203A'`]/g, '\'')
          .replace(/[\u201C\u201D\u201E\u00AB\u00BB"]/g, '"')
      const stripIndent = (s: string) => s.split('\n').map(l => l.trimStart()).join('\n')

      function findLayered(haystack: string, needle: string): { index: number, matchedText: string, layer: string } | null {
        // Layer 1: Exact
        const exact = haystack.indexOf(needle)
        if (exact !== -1)
          return { index: exact, matchedText: needle, layer: 'exact' }

        // Layer 2: Whitespace-normalized
        const hNorm = normalizeWS(haystack)
        const nNorm = normalizeWS(needle)
        const wsIdx = hNorm.indexOf(nNorm)
        if (wsIdx !== -1) {
          // Map back to original: find the line range
          const beforeNorm = hNorm.slice(0, wsIdx)
          const lineStart = beforeNorm.split('\n').length - 1
          const lineCount = nNorm.split('\n').length
          const lines = haystack.split('\n')
          const matchedText = lines.slice(lineStart, lineStart + lineCount).join('\n')
          const index = haystack.indexOf(matchedText)
          if (index !== -1)
            return { index, matchedText, layer: 'whitespace_normalized' }
        }

        // Layer 3: Quote-normalized
        const hQ = normalizeQuotes(haystack)
        const nQ = normalizeQuotes(needle)
        if (hQ !== haystack || nQ !== needle) {
          const qIdx = hQ.indexOf(nQ)
          if (qIdx !== -1) {
            const matchedText = haystack.slice(qIdx, qIdx + nQ.length)
            return { index: qIdx, matchedText, layer: 'quote_normalized' }
          }
        }

        // Layer 4: Indent-normalized
        const hI = stripIndent(haystack)
        const nI = stripIndent(needle)
        if (nI.length > 10) {
          const iIdx = hI.indexOf(nI)
          if (iIdx !== -1) {
            const beforeI = hI.slice(0, iIdx)
            const lineStart = beforeI.split('\n').length - 1
            const lineCount = nI.split('\n').length
            const lines = haystack.split('\n')
            const matchedText = lines.slice(lineStart, lineStart + lineCount).join('\n')
            const index = haystack.indexOf(matchedText)
            if (index !== -1)
              return { index, matchedText, layer: 'indent_normalized' }
          }
        }

        return null
      }

      // Apply edits sequentially, validating each one
      const applied: Array<{ line: number, linesRemoved: number, linesAdded: number, layer: string }> = []
      const errors: string[] = []

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i]!
        const match = findLayered(content, edit.old_text)
        if (!match) {
          errors.push(`Edit ${i + 1}: old_text not found (tried exact, whitespace, quote, indent matching). Searched for: ${JSON.stringify(edit.old_text.slice(0, 80))}`)
          continue
        }

        // Check for multiple matches (only exact layer — fuzzy layers are less likely to collide)
        if (match.layer === 'exact') {
          const secondIndex = content.indexOf(edit.old_text, match.index + edit.old_text.length)
          if (secondIndex !== -1) {
            errors.push(`Edit ${i + 1}: old_text matches multiple locations (lines ${content.slice(0, match.index).split('\n').length} and ${content.slice(0, secondIndex).split('\n').length}). Provide more context.`)
            continue
          }
        }

        const lineNum = content.slice(0, match.index).split('\n').length
        content = content.slice(0, match.index) + edit.new_text + content.slice(match.index + match.matchedText.length)
        applied.push({
          line: lineNum,
          linesRemoved: match.matchedText.split('\n').length,
          linesAdded: edit.new_text.split('\n').length,
          layer: match.layer,
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
        // Diff preview summary for multi-edit
        diff_summary: `${applied.length} edit(s) applied: ${applied.map(a => `L${a.line}[${a.layer}]: -${a.linesRemoved}/+${a.linesAdded}`).join(', ')}`,
      }
    },

    // ─── Git Integration Tools ───
    // Safe, structured git operations that bypass the bash write guard.

    git_status: async () => {
      const { execSync } = await import('node:child_process')
      try {
        const status = execSync('git status --porcelain', { cwd: workspacePath, encoding: 'utf-8', timeout: 10_000 })
        const branch = execSync('git branch --show-current', { cwd: workspacePath, encoding: 'utf-8', timeout: 5_000 }).trim()
        const lines = status.trim().split('\n').filter(Boolean)
        return {
          branch,
          totalChanges: lines.length,
          staged: lines.filter(l => l[0] !== ' ' && l[0] !== '?').length,
          unstaged: lines.filter(l => l[1] === 'M' || l[1] === 'D').length,
          untracked: lines.filter(l => l.startsWith('??')).length,
          files: lines.slice(0, 50).map(l => ({ status: l.slice(0, 2), path: l.slice(3) })),
        }
      }
      catch (err: any) {
        return { error: `git status failed: ${err.message}` }
      }
    },

    git_diff: async (args) => {
      const { execSync } = await import('node:child_process')
      const filePath = args.file_path as string | undefined
      const staged = args.staged as boolean | undefined
      try {
        const cmd = ['git', 'diff']
        if (staged)
          cmd.push('--staged')
        if (filePath)
          cmd.push('--', filePath)
        const diff = execSync(cmd.join(' '), { cwd: workspacePath, encoding: 'utf-8', timeout: 15_000 })
        if (!diff.trim())
          return { message: 'No changes.', diff: '' }
        // Truncate very long diffs
        const maxChars = 30_000
        if (diff.length > maxChars) {
          return {
            diff: `${diff.slice(0, maxChars)}\n\n... [${diff.length - maxChars} chars truncated]`,
            truncated: true,
          }
        }
        return { diff }
      }
      catch (err: any) {
        return { error: `git diff failed: ${err.message}` }
      }
    },

    git_stash: async (args) => {
      const { execFileSync } = await import('node:child_process')
      const action = (args.action as string) || 'push'
      try {
        if (action === 'push') {
          const message = args.message as string | undefined
          // NOTICE: Use execFileSync with array args to prevent shell injection.
          // LLM-generated messages can contain $(), backticks, etc.
          const gitArgs = message ? ['stash', 'push', '-m', message] : ['stash', 'push']
          const output = execFileSync('git', gitArgs, { cwd: workspacePath, encoding: 'utf-8', timeout: 15_000 })
          return { action: 'push', output: output.trim() }
        }
        else if (action === 'pop') {
          const output = execFileSync('git', ['stash', 'pop'], { cwd: workspacePath, encoding: 'utf-8', timeout: 15_000 })
          return { action: 'pop', output: output.trim() }
        }
        else if (action === 'list') {
          const output = execFileSync('git', ['stash', 'list'], { cwd: workspacePath, encoding: 'utf-8', timeout: 10_000 })
          return { action: 'list', stashes: output.trim().split('\n').filter(Boolean) }
        }
        else {
          return { error: `Unknown stash action: ${action}. Use push, pop, or list.` }
        }
      }
      catch (err: any) {
        return { error: `git stash ${action} failed: ${err.message}` }
      }
    },

    git_commit: async (args) => {
      const { execFileSync } = await import('node:child_process')
      const message = args.message as string
      if (!message)
        return { error: 'Commit message is required.' }
      try {
        // Stage all changes first
        execFileSync('git', ['add', '-A'], { cwd: workspacePath, encoding: 'utf-8', timeout: 10_000 })
        // NOTICE: Use execFileSync with array args to prevent shell injection.
        execFileSync('git', ['commit', '-m', message], { cwd: workspacePath, encoding: 'utf-8', timeout: 15_000 })
        return { success: true, output: `Committed with message: ${message}` }
      }
      catch (err: any) {
        return { error: `git commit failed: ${err.message}` }
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
): Promise<{ result: string, error: boolean }> {
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
      description: 'Create a NEW file with content. Parent directories are created automatically. '
        + 'BLOCKED on existing files — use edit_file to modify existing files. '
        + 'Set overwrite: true only if you need to completely replace a file.',
      parameters: {
        type: 'object',
        required: ['file_path', 'content'],
        properties: {
          file_path: { type: 'string', description: 'File path to write.' },
          content: { type: 'string', description: 'Full file content to write.' },
          overwrite: { type: 'boolean', description: 'Set to true to allow overwriting an existing file. Default: false (blocks on existing files).' },
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
      name: 'search_symbol',
      description: 'Find definitions of a symbol across the workspace using Semantic Navigation. '
        + 'Returns exact AST-based matches with line and column numbers. Currently supports JS/TS files.',
      parameters: {
        type: 'object',
        required: ['symbol_name'],
        properties: {
          symbol_name: { type: 'string', description: 'Name of the symbol (e.g., function, class, interface) to definitions for.' },
          target_path: { type: 'string', description: 'Optional sub-directory to limit search scope.' },
          file_pattern: { type: 'string', description: 'Optional glob pattern to limit scope (e.g., **/*.ts).' },
        },
      },
    },
    {
      name: 'find_references',
      description: 'Find all references/usages of a symbol at a specific file location using Semantic Navigation. '
        + 'Provide the exact file_path, line, and column where the symbol is defined or used.',
      parameters: {
        type: 'object',
        required: ['file_path', 'line', 'column'],
        properties: {
          file_path: { type: 'string', description: 'Absolute or workspace-relative path of the file.' },
          line: { type: 'number', description: 'Line number (1-indexed) where the symbol is located.' },
          column: { type: 'number', description: 'Column number (1-indexed) where the symbol is located.' },
        },
      },
    },
    {
      name: 'get_diagnostics',
      description: 'Get AST/LSP-level syntax and semantic diagnostics (errors/warnings) for a specific file. '
        + 'Helps pinpoint why a file might be failing continuous integration or typechecks.',
      parameters: {
        type: 'object',
        required: ['file_path'],
        properties: {
          file_path: { type: 'string', description: 'Path to the file to typecheck/analyze.' },
        },
      },
    },
    {
      name: 'bash',
      description: 'Run a shell command for TESTING, BUILDING, or GIT QUERIES only. '
        + 'NOT for file discovery (use list_files/search_text). '
        + 'NOT for file reading (use read_file). '
        + 'NOT for file writing (blocked — use edit_file/write_file). '
        + 'Returns stdout, stderr, and exit code.',
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
        + 'Supports 6-layer matching: exact → whitespace-normalized → quote-normalized → indent-normalized → fuzzy auto-apply → line-anchored. '
        + 'If old_text matching fails, you can use start_line/end_line to edit by line range (most reliable for large files). '
        + 'Use this instead of write_file when modifying existing files — it is safer and preserves unchanged content.',
      parameters: {
        type: 'object',
        required: ['file_path', 'old_text', 'new_text'],
        properties: {
          file_path: { type: 'string', description: 'File path to edit.' },
          old_text: { type: 'string', description: 'Text to find and replace. Has 6-layer fuzzy matching so minor whitespace/quote differences are handled automatically.' },
          new_text: { type: 'string', description: 'Replacement text.' },
          start_line: { type: 'number', description: 'Optional. Start line (1-indexed) for line-anchored editing. When provided with end_line, replaces lines start_line through end_line with new_text. Most reliable for large files.' },
          end_line: { type: 'number', description: 'Optional. End line (1-indexed, inclusive) for line-anchored editing.' },
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
    // ─── Git Integration Tools ───
    {
      name: 'git_status',
      description: 'Get the git status of the workspace: current branch, staged/unstaged/untracked files.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'git_diff',
      description: 'Show git diff of changes. Can be filtered to a specific file and staged/unstaged.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Optional: limit diff to this file path.' },
          staged: { type: 'boolean', description: 'If true, show staged changes. Default: false (unstaged).' },
        },
      },
    },
    {
      name: 'git_stash',
      description: 'Manage git stash: push (save changes), pop (restore), or list stashes.',
      parameters: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', description: 'Action: push, pop, or list.' },
          message: { type: 'string', description: 'Stash message (for push action).' },
        },
      },
    },
    {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit.',
      parameters: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', description: 'Commit message.' },
        },
      },
    },
  ]
}

// buildDiffPreview moved to edit-engine.ts

// ─── Doc candidate helpers ───

/**
 * Check if a file path is a TS/JS/Python source file that could have exports.
 * Used to decide whether to attach undocumented export metadata.
 */
function isDocCandidateFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'py'].includes(ext)
}

/**
 * Build metadata about undocumented exports for a source file.
 * Returns undefined if there are no exports at all (non-module file).
 */
function buildDocCandidateMeta(lines: string[]): Record<string, unknown> | undefined {
  const { undocumented, documented } = findUndocumentedExports(lines)
  const total = undocumented.length + documented
  if (total === 0)
    return undefined

  return {
    undocumentedExports: undocumented.slice(0, 20),
    documentedExportsCount: documented,
    undocumentedExportsCount: undocumented.length,
    ...(undocumented.length === 0
      ? { docHint: 'All exports in this file already have documentation. Choose a different file.' }
      : { docHint: `${undocumented.length} exports need documentation. Pick one from undocumentedExports and add JSDoc/docstring.` }),
  }
}
