/**
 * Edit engine — layered text matching and file editing.
 *
 * Extracted from tool-router.ts to keep each module under ~500 lines.
 * Contains all the fuzzy/normalized matching logic, the outline extractor,
 * and the diff preview builder.
 *
 * Match layers (in order):
 * 0. Line-anchored (start_line/end_line)
 * 1. Exact match
 * 2. Whitespace-normalized
 * 3. Quote-normalized
 * 4. Indent-normalized
 * 5. Fuzzy window (auto-apply ≥85%, suggest ≥70%)
 * 6. Total failure with preview
 */

/**
 * Apply a single search-and-replace edit to a file with LAYERED MATCHING.
 */
export async function applySingleEdit(
  filePath: string,
  oldText: string,
  newText: string,
  startLine?: number,
  endLine?: number,
): Promise<unknown> {
  const fs = await import('node:fs/promises')

  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  }
  catch {
    return { error: `File not found: ${filePath}. Use write_file to create new files.` }
  }

  // ─── Layer 0: Line-anchored edit (bypass text matching entirely) ───
  // NOTICE: When the agent provides start_line + end_line, we replace that
  // range directly. This is the most reliable edit mode for large files
  // where the agent already knows the exact location from a previous read.
  if (startLine != null && endLine != null) {
    const lines = content.split('\n')
    const s = Math.max(1, startLine) - 1 // 0-indexed
    const e = Math.min(endLine, lines.length) // inclusive → exclusive
    if (s >= lines.length) {
      return { error: `start_line ${startLine} is beyond file end (${lines.length} lines)` }
    }
    const actualOld = lines.slice(s, e).join('\n')
    // If old_text is provided, verify it roughly matches for safety
    if (oldText && oldText.trim().length > 0) {
      const oldTrimmed = oldText.split('\n').map(l => l.trim()).join('\n')
      const actualTrimmed = actualOld.split('\n').map(l => l.trim()).join('\n')
      if (!actualTrimmed.includes(oldTrimmed.slice(0, 50)) && !oldTrimmed.includes(actualTrimmed.slice(0, 50))) {
        return {
          error: `Line range ${startLine}-${endLine} does not match old_text.`,
          actualContent: actualOld.length > 500 ? `${actualOld.slice(0, 500)}...` : actualOld,
          hint: 'Read the file again to get the current content at those lines.',
        }
      }
    }
    const beforeLines = lines.slice(0, s)
    const afterLines = lines.slice(e)
    const newContent = [...beforeLines, newText, ...afterLines].join('\n')
    await fs.writeFile(filePath, newContent, 'utf-8')
    return {
      success: true,
      file: filePath,
      matchType: 'line_anchored',
      line: startLine,
      linesRemoved: e - s,
      linesAdded: newText.split('\n').length,
    }
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
    const actualRange = findOriginalRange(content, contentNorm, wsIndex, oldNorm.length)
    if (actualRange) {
      return applyAndReport(fs, filePath, content, actualRange.start, content.slice(actualRange.start, actualRange.end), newText, 'whitespace_normalized')
    }
  }

  // ─── Layer 3: Quote-normalized match ───
  // NOTICE: LLMs frequently confuse single/double quotes, smart/curly quotes,
  // and backtick variants. This layer normalizes all quote characters before
  // matching, then applies the edit using the original text.
  const normalizeQuotes = (s: string) =>
    s.replace(/[\u2018\u2019\u201A\u2039\u203A'`]/g, '\'')
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB"]/g, '"')
  const contentQuoted = normalizeQuotes(content)
  const oldQuoted = normalizeQuotes(oldText)
  if (oldQuoted !== oldText || contentQuoted !== content) {
    const qIndex = contentQuoted.indexOf(oldQuoted)
    if (qIndex !== -1) {
      const actualOld = content.slice(qIndex, qIndex + oldQuoted.length)
      return applyAndReport(fs, filePath, content, qIndex, actualOld, newText, 'quote_normalized')
    }
  }

  // ─── Layer 4: Indent-normalized match ───
  const stripIndent = (s: string) => s.split('\n').map(l => l.trimStart()).join('\n')
  const contentStripped = stripIndent(content)
  const oldStripped = stripIndent(oldText)
  if (oldStripped.length > 10) {
    const indentIndex = contentStripped.indexOf(oldStripped)
    if (indentIndex !== -1) {
      const actualRange = findOriginalRange(content, contentStripped, indentIndex, oldStripped.length)
      if (actualRange) {
        return applyAndReport(fs, filePath, content, actualRange.start, content.slice(actualRange.start, actualRange.end), newText, 'indent_normalized')
      }
    }
  }

  // ─── Layer 5: Fuzzy window match — auto-apply if high confidence ───
  const candidates = findFuzzyCandidates(content, oldText, 3)

  if (candidates.length > 0) {
    const best = candidates[0]!

    // NOTICE: Auto-apply threshold at 85%. Below that, the risk of applying
    // the wrong block is too high. Between 70-85% we report candidates.
    if (best.similarity >= 0.85) {
      const lines = content.split('\n')
      const beforeLines = lines.slice(0, best.lineStart - 1)
      const afterLines = lines.slice(best.lineEnd)
      const newContent = [...beforeLines, ...newText.split('\n'), ...afterLines].join('\n')
      await fs.writeFile(filePath, newContent, 'utf-8')
      return {
        success: true,
        file: filePath,
        matchType: `fuzzy_auto_applied (${Math.round(best.similarity * 100)}%)`,
        line: best.lineStart,
        linesRemoved: best.lineEnd - best.lineStart + 1,
        linesAdded: newText.split('\n').length,
        warning: `Applied via fuzzy match (${Math.round(best.similarity * 100)}% similarity). Verify the result with read_file.`,
      }
    }

    if (best.similarity >= 0.7) {
      return {
        error: `Exact match not found. Found ${candidates.length} similar candidate(s).`,
        matchType: 'fuzzy_candidates',
        candidates: candidates.map(c => ({
          lineStart: c.lineStart,
          lineEnd: c.lineEnd,
          similarity: `${Math.round(c.similarity * 100)}%`,
          snippet: c.text.length > 400 ? `${c.text.slice(0, 400)}...` : c.text,
        })),
        diagnostic: buildDiagnosticDiff(oldText, best.text),
        hint: 'Copy the exact text from the snippet above as old_text, or use start_line/end_line to edit by line range.',
      }
    }
  }

  // ─── Layer 6: Total failure — show file structure + diagnostic ───
  const lines = content.split('\n')
  const preview = lines.slice(0, Math.min(30, lines.length))
    .map((l, i) => `${String(i + 1).padStart(5)}  ${l}`)
    .join('\n')

  return {
    error: `old_text not found in ${filePath}. No similar text found (file has ${lines.length} lines).`,
    hint: 'Read the file with read_file to see its current content, then use the exact text for old_text. You can also use start_line/end_line to edit by line range.',
    preview: preview.length > 2000 ? `${preview.slice(0, 2000)}\n[...]` : preview,
    ...(candidates.length > 0
      ? {
          bestCandidate: {
            lineStart: candidates[0]!.lineStart,
            similarity: `${Math.round(candidates[0]!.similarity * 100)}%`,
            snippet: candidates[0]!.text.slice(0, 200),
          },
        }
      : {}),
  }
}

/**
 * Build a human-readable diagnostic showing exactly what differs
 * between the agent's old_text and the actual file content.
 */
function buildDiagnosticDiff(expected: string, actual: string): string {
  const expLines = expected.split('\n')
  const actLines = actual.split('\n')
  const diffs: string[] = []

  const maxLines = Math.max(expLines.length, actLines.length)
  for (let i = 0; i < Math.min(maxLines, 10); i++) {
    const exp = expLines[i] ?? '<missing>'
    const act = actLines[i] ?? '<missing>'
    if (exp !== act) {
      diffs.push(`  Line ${i + 1}:`)
      diffs.push(`    yours:  ${JSON.stringify(exp.slice(0, 120))}`)
      diffs.push(`    actual: ${JSON.stringify(act.slice(0, 120))}`)
    }
  }

  if (diffs.length === 0)
    return 'Lines match but overall text differs (trailing newline or whitespace issue)'
  return diffs.join('\n')
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
): { start: number, end: number } | null {
  const origLines = original.split('\n')
  const normLines = normalized.split('\n')

  if (origLines.length !== normLines.length)
    return null

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

  if (startLine === -1)
    return null
  if (endLine === -1)
    endLine = origLines.length - 1

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
): Array<{ lineStart: number, lineEnd: number, similarity: number, text: string }> {
  const contentLines = content.split('\n')
  const targetLines = target.split('\n')
  const targetLen = targetLines.length
  const targetTokens = new Set(targetLines.flatMap(l => l.trim().split(/\s+/).filter(Boolean)))

  if (targetTokens.size === 0)
    return []

  const candidates: Array<{ lineStart: number, lineEnd: number, similarity: number, text: string }> = []

  const windowSize = Math.max(targetLen, 3)
  for (let i = 0; i <= contentLines.length - windowSize; i++) {
    const windowLines = contentLines.slice(i, i + windowSize)
    const windowTokens = new Set(windowLines.flatMap(l => l.trim().split(/\s+/).filter(Boolean)))

    // Jaccard similarity
    let intersection = 0
    for (const t of targetTokens) {
      if (windowTokens.has(t))
        intersection++
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

  candidates.sort((a, b) => b.similarity - a.similarity)

  // Deduplicate overlapping ranges
  const filtered: typeof candidates = []
  for (const c of candidates) {
    if (filtered.length >= maxCandidates)
      break
    const overlaps = filtered.some(f =>
      (c.lineStart >= f.lineStart && c.lineStart <= f.lineEnd)
      || (c.lineEnd >= f.lineStart && c.lineEnd <= f.lineEnd),
    )
    if (!overlaps)
      filtered.push(c)
  }

  return filtered
}

/**
 * Extract a structural outline from source code lines.
 *
 * Detects exported functions, classes, types, interfaces, and variables
 * across TypeScript/JavaScript and Python, returning their name and line number.
 * This is used to give the agent a "table of contents" for large files
 * so it knows where to read with start_line/end_line.
 */
export function extractOutline(lines: string[]): Array<{ line: number, kind: string, name: string }> {
  const results: Array<{ line: number, kind: string, name: string }> = []

  // NOTICE: These patterns are intentionally broad to catch most common
  // export styles. They may produce false positives on comments/strings,
  // but that's acceptable for a navigation aid — precision < recall here.
  const patterns: Array<{ pattern: RegExp, kindFn: (m: RegExpMatchArray) => string, nameFn: (m: RegExpMatchArray) => string }> = [
    // TypeScript/JavaScript: export function foo, export async function foo
    { pattern: /^export\s+(?:async\s+)?function\s+(\w+)/, kindFn: () => 'function', nameFn: m => m[1] },
    // export class Foo
    { pattern: /^export\s+class\s+(\w+)/, kindFn: () => 'class', nameFn: m => m[1] },
    // export interface Foo
    { pattern: /^export\s+interface\s+(\w+)/, kindFn: () => 'interface', nameFn: m => m[1] },
    // export type Foo
    { pattern: /^export\s+type\s+(\w+)/, kindFn: () => 'type', nameFn: m => m[1] },
    // export const/let/var foo
    { pattern: /^export\s+(?:const|let|var)\s+(\w+)/, kindFn: () => 'const', nameFn: m => m[1] },
    // export default function/class
    { pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/, kindFn: () => 'default function', nameFn: m => m[1] },
    { pattern: /^export\s+default\s+class\s+(\w+)/, kindFn: () => 'default class', nameFn: m => m[1] },
    // Python: def foo, class Foo, async def foo
    { pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/, kindFn: () => 'def', nameFn: m => m[1] },
    { pattern: /^class\s+(\w+)\s*[:(]/, kindFn: () => 'class', nameFn: m => m[1] },
  ]

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    for (const { pattern, kindFn, nameFn } of patterns) {
      const match = trimmed.match(pattern)
      if (match) {
        results.push({ line: i + 1, kind: kindFn(match), name: nameFn(match) })
        break // one match per line
      }
    }
  }

  // Cap at 80 entries to avoid bloating the response
  return results.slice(0, 80)
}

/**
 * Build a unified diff preview for a single edit.
 * Shows - lines (removed) and + lines (added).
 */
export function buildDiffPreview(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  const diffLines: string[] = []

  // Find the first and last differing lines
  let firstDiff = 0
  while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) {
    firstDiff++
  }

  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd > firstDiff && newEnd > firstDiff && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--
    newEnd--
  }

  // Context lines before
  if (firstDiff > 0) {
    diffLines.push(` ${oldLines[firstDiff - 1]}`)
  }

  // Removed lines
  for (let i = firstDiff; i <= oldEnd; i++) {
    diffLines.push(`-${oldLines[i]}`)
  }

  // Added lines
  for (let i = firstDiff; i <= newEnd; i++) {
    diffLines.push(`+${newLines[i]}`)
  }

  // Context after
  if (oldEnd + 1 < oldLines.length) {
    diffLines.push(` ${oldLines[oldEnd + 1]}`)
  }

  return diffLines.join('\n')
}
