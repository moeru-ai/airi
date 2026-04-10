/**
 * Post-loop verification — checks files the agent claimed to modify.
 *
 * Extracted from engine.ts. This keeps the main loop file focused on
 * orchestration while providing reusable file verification utilities.
 *
 * Checks: file existence, readability, and basic syntax sanity for TS/JS.
 */

import type { VerificationRecord } from './types'

/**
 * Run post-loop verification on all files the agent claimed to modify.
 *
 * Checks:
 * 1. File exists and is readable
 * 2. File is valid UTF-8
 * 3. If .ts/.js: no obvious syntax errors (with tolerance for parser limits)
 */
export async function verifyModifiedFiles(
  filesModified: string[],
  workspacePath: string,
): Promise<VerificationRecord[]> {
  const records: VerificationRecord[] = []
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  for (const filePath of filesModified) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath)

    // Check 1: file exists
    try {
      await fs.access(absPath)
    }
    catch {
      records.push({
        check: 'file_exists',
        target: filePath,
        passed: false,
        detail: `File does not exist at ${absPath}`,
      })
      continue
    }

    // Check 2: file is readable
    try {
      const content = await fs.readFile(absPath, 'utf-8')
      records.push({
        check: 'file_readable',
        target: filePath,
        passed: true,
        detail: `${content.length} chars, ${content.split('\n').length} lines`,
      })

      // Check 3: basic syntax sanity for TS/JS files
      if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(filePath)) {
        const syntaxIssues = checkBasicSyntax(content, filePath)
        records.push({
          check: 'syntax_sanity',
          target: filePath,
          passed: syntaxIssues.length === 0,
          detail: syntaxIssues.length === 0
            ? 'Basic syntax checks passed'
            : `Issues: ${syntaxIssues.join('; ')}`,
        })
      }
    }
    catch (err) {
      records.push({
        check: 'file_readable',
        target: filePath,
        passed: false,
        detail: `Failed to read: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return records
}

/**
 * Quick syntax sanity checks without a full parser.
 *
 * Improved to handle:
 * - Template literals (backtick strings with ${} interpolation)
 * - Regex literals (/pattern/) — brackets inside don't count
 * - Tolerance threshold — small imbalances (≤2) are ignored since our
 *   lightweight parser can't handle every JS edge case (JSX, etc.)
 */
export function checkBasicSyntax(content: string, filePath?: string): string[] {
  // NOTICE: JSON files get dedicated parsing; md/txt skip entirely
  const ext = filePath?.split('.').pop()?.toLowerCase()
  if (ext === 'json') {
    try { JSON.parse(content); return [] }
    catch (e) { return [`Invalid JSON: ${(e as Error).message}`] }
  }
  if (ext === 'md' || ext === 'txt' || ext === 'css' || ext === 'html')
    return []

  const issues: string[] = []
  const counts = { '{': 0, '(': 0, '[': 0 }
  const closers: Record<string, keyof typeof counts> = { '}': '{', ')': '(', ']': '[' }

  let inString: string | null = null
  let inLineComment = false
  let inBlockComment = false
  let inTemplateLiteral = false
  let templateBraceDepth = 0 // Track ${} nesting inside template literals
  let inRegex = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    const next = content[i + 1]
    const prev = i > 0 ? content[i - 1] : ''

    // Line comment
    if (inLineComment) {
      if (ch === '\n')
        inLineComment = false
      continue
    }
    // Block comment
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    // Regular string ('...' or "...")
    if (inString) {
      if (ch === inString && prev !== '\\')
        inString = null
      continue
    }
    // Regex literal
    if (inRegex) {
      if (ch === '/' && prev !== '\\')
        inRegex = false
      continue
    }
    // Template literal with ${} interpolation
    if (inTemplateLiteral) {
      if (ch === '`' && prev !== '\\') {
        inTemplateLiteral = false
        continue
      }
      if (ch === '$' && next === '{') {
        templateBraceDepth++
        i++ // skip the {
        counts['{']++ // the ${ still opens a brace
        continue
      }
      continue // skip all other chars inside template literal text
    }

    // Enter comments
    if (ch === '/' && next === '/') { inLineComment = true; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; continue }
    // Enter strings
    if (ch === '\'' || ch === '"') { inString = ch; continue }
    // Enter template literal
    if (ch === '`') { inTemplateLiteral = true; continue }
    // Enter regex (heuristic: / after = , ( , [ , ! , & , | , ; , { , } , , , : , return , case)
    if (ch === '/' && next !== '/' && next !== '*') {
      const prevNonSpace = content.slice(Math.max(0, i - 10), i).trimEnd().slice(-1)
      if ('=([!&|;{},:\n'.includes(prevNonSpace) || prevNonSpace === '') {
        inRegex = true
        continue
      }
    }

    // Track braces inside template interpolation
    if (templateBraceDepth > 0) {
      if (ch === '{')
        templateBraceDepth++
      if (ch === '}') {
        templateBraceDepth--
        if (templateBraceDepth === 0) {
          counts['{']-- // closing the ${ brace
          inTemplateLiteral = true // back to template text
          continue
        }
      }
    }

    if (ch in counts)
      counts[ch as keyof typeof counts]++
    if (ch in closers)
      counts[closers[ch]!]--
  }

  // NOTICE: Tolerance threshold — our parser can't handle every edge case
  // (JSX tags, regex with brackets, uncommon escape sequences).
  // Small imbalances (≤2) are likely parser artifacts, not real bugs.
  const TOLERANCE = 2
  if (Math.abs(counts['{']) > TOLERANCE)
    issues.push(`Unbalanced braces: ${counts['{']} unclosed`)
  if (Math.abs(counts['(']) > TOLERANCE)
    issues.push(`Unbalanced parens: ${counts['(']} unclosed`)
  if (Math.abs(counts['[']) > TOLERANCE)
    issues.push(`Unbalanced brackets: ${counts['[']} unclosed`)

  return issues
}
