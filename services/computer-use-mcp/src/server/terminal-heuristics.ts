/**
 * Heuristics for interpreting terminal screen content.
 * These are purely observational and do not modify the state of the PTY.
 */

export interface TerminalHeuristicsResult {
  extractedCwd?: string
  pagination?: {
    reason: string
    suggestedAction: 'press_q' | 'press_space'
  }
}

/**
 * Detects common pagination markers (more, less, etc.) in terminal output.
 */
export function detectPagination(screenContent: string): TerminalHeuristicsResult['pagination'] | undefined {
  if (!screenContent)
    return undefined

  const lines = stripAnsiEscapeCodes(screenContent)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0)
    return undefined

  const lastLine = lines[lines.length - 1]
  const secondLastLine = lines.length > 1 ? lines[lines.length - 2].trim() : ''

  // Common pagination patterns
  if (lastLine.includes('--More--')) {
    return { reason: 'Pagination detected (--More--)', suggestedAction: 'press_space' }
  }

  if (lastLine === '(END)') {
    return { reason: 'End of output or pager prompt detected', suggestedAction: 'press_q' }
  }

  if (lastLine === ':' && hasPagerContext(lines)) {
    return { reason: 'Pager prompt detected', suggestedAction: 'press_q' }
  }

  // Sometimes help or man pages end with a specific manual prompt
  if (secondLastLine.includes('Manual page') && lastLine.includes('line 1')) {
    return { reason: 'Man page detected', suggestedAction: 'press_q' }
  }

  return undefined
}

/**
 * Best-effort extraction of CWD from a terminal prompt.
 * Supported patterns:
 * - user@host:path$
 * - [user@host path]$
 * - path >
 */
export function extractCwdFromPrompt(line: string): string | undefined {
  const cleanLine = stripAnsiEscapeCodes(line).trim()
  if (!cleanLine || cleanLine.length > 200)
    return undefined

  // Pattern 1: user@host:path$ (typical bash/zsh default)
  const pattern1 = /[\w.-]+@[\w.-]+:([^$#\s>]+)\s*[$#]\s*$/
  const match1 = cleanLine.match(pattern1)
  if (match1)
    return match1[1]

  // Pattern 2: [user@host path]$ (CentOS/RHEL)
  if (cleanLine.startsWith('[')) {
    const closeBracketIndex = cleanLine.lastIndexOf(']')
    if (closeBracketIndex > 0) {
      const suffix = cleanLine.slice(closeBracketIndex + 1).trim()
      const promptBody = cleanLine.slice(1, closeBracketIndex)
      const firstSpaceIndex = promptBody.indexOf(' ')
      if ((suffix === '$' || suffix === '#') && firstSpaceIndex > 0) {
        return promptBody.slice(firstSpaceIndex + 1)
      }
    }
  }

  // Pattern 3: Simple path > (generic)
  const pattern3 = /^(\/(?:[\w.-]+\/)*[\w.-]+)\s*>\s*$/
  const match3 = cleanLine.match(pattern3)
  if (match3)
    return match3[1]

  return undefined
}

function hasPagerContext(lines: string[]): boolean {
  const recentLines = lines.slice(Math.max(0, lines.length - 6), -1)

  return recentLines.some((line) => {
    return line.includes('Manual page')
      || line.includes('press h for help')
      || /^lines?\s+\d+[-,]\d+/i.test(line)
      || /^\d+%$/.test(line)
  })
}

function stripAnsiEscapeCodes(value: string): string {
  let stripped = ''

  for (let index = 0; index < value.length;) {
    if (value[index] !== '\u001B') {
      stripped += value[index]
      index += 1
      continue
    }

    index += 1
    const marker = value[index]

    if (marker === '[') {
      index += 1
      while (index < value.length) {
        const code = value.charCodeAt(index)
        index += 1
        if (code >= 0x40 && code <= 0x7E)
          break
      }
      continue
    }

    if (marker === ']') {
      index += 1
      while (index < value.length) {
        if (value.charCodeAt(index) === 0x07) {
          index += 1
          break
        }
        if (value[index] === '\u001B' && value[index + 1] === '\\') {
          index += 2
          break
        }
        index += 1
      }
      continue
    }

    if (marker)
      index += 1
  }

  return stripped
}
