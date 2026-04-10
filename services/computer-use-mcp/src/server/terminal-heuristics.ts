/**
 * Heuristics for interpreting terminal screen content.
 * These are purely observational and do not modify the state of the PTY.
 */

export interface TerminalHeuristicsResult {
  pagination?: {
    suggestedAction: 'press_space' | 'press_q'
    reason: string
  }
  extractedCwd?: string
}

/**
 * Detects common pagination markers (more, less, etc.) in terminal output.
 */
export function detectPagination(screenContent: string): TerminalHeuristicsResult['pagination'] | undefined {
  if (!screenContent)
    return undefined

  const lines = screenContent.split('\n')
  const lastLine = lines[lines.length - 1].trim()
  const secondLastLine = lines.length > 1 ? lines[lines.length - 2].trim() : ''

  // Common pagination patterns
  if (lastLine.includes('--More--')) {
    return { suggestedAction: 'press_space', reason: 'Pagination detected (--More--)' }
  }

  if (lastLine === ':' || lastLine.includes('(END)')) {
    return { suggestedAction: 'press_q', reason: 'End of output or pager prompt detected' }
  }

  // Sometimes help or man pages end with a specific manual prompt
  if (secondLastLine.includes('Manual page') && lastLine.includes('line 1')) {
    return { suggestedAction: 'press_q', reason: 'Man page detected' }
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
  if (!line || line.length > 200)
    return undefined

  // Pattern 1: user@host:path$ (typical bash/zsh default)
  const pattern1 = /[\w.-]+@[\w.-]+:([^$#\s>]+)\s*[$#]\s*$/
  const match1 = line.match(pattern1)
  if (match1)
    return match1[1]

  // Pattern 2: [user@host path]$ (CentOS/RHEL)
  if (line.startsWith('[')) {
    const closeBracketIndex = line.lastIndexOf(']')
    if (closeBracketIndex > 0) {
      const suffix = line.slice(closeBracketIndex + 1).trim()
      const promptBody = line.slice(1, closeBracketIndex)
      const firstSpaceIndex = promptBody.indexOf(' ')
      if ((suffix === '$' || suffix === '#') && firstSpaceIndex > 0) {
        return promptBody.slice(firstSpaceIndex + 1)
      }
    }
  }

  // Pattern 3: Simple path > (generic)
  const pattern3 = /^(\/(?:[\w.-]+\/)*[\w.-]+)\s*>\s*$/
  const match3 = line.match(pattern3)
  if (match3)
    return match3[1]

  return undefined
}
