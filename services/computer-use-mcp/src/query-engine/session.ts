/**
 * Session persistence — save and restore query engine state.
 *
 * Enables long-running tasks to survive process restarts.
 * Sessions are stored as JSON files in a configurable directory.
 *
 * NOTICE: Only conversation history and budget state are serialized.
 * File system state (primitives, terminal) must be re-provided on restore.
 */

import type { QueryMessage, SessionState } from './types'

const DEFAULT_SESSION_DIR = '/tmp/airi-sessions'

/**
 * Save session state to disk.
 */
export async function saveSession(state: SessionState, sessionDir?: string): Promise<string> {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const dir = sessionDir ?? DEFAULT_SESSION_DIR
  await fs.mkdir(dir, { recursive: true })

  const filePath = path.join(dir, `${state.sessionId}.json`)
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')

  return filePath
}

/**
 * Load session state from disk. Returns null if not found.
 */
export async function loadSession(sessionId: string, sessionDir?: string): Promise<SessionState | null> {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const dir = sessionDir ?? DEFAULT_SESSION_DIR
  const filePath = path.join(dir, `${sessionId}.json`)

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as SessionState
  }
  catch {
    return null
  }
}

/**
 * Delete a session from disk.
 */
export async function deleteSession(sessionId: string, sessionDir?: string): Promise<void> {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const dir = sessionDir ?? DEFAULT_SESSION_DIR
  const filePath = path.join(dir, `${sessionId}.json`)

  try {
    await fs.unlink(filePath)
  }
  catch { /* ignore if not found */ }
}

/**
 * List all saved sessions.
 */
export async function listSessions(sessionDir?: string): Promise<Array<{ sessionId: string; savedAt: string; status: string; goal: string }>> {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const dir = sessionDir ?? DEFAULT_SESSION_DIR

  try {
    const files = await fs.readdir(dir)
    const sessions: Array<{ sessionId: string; savedAt: string; status: string; goal: string }> = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf-8')
        const state = JSON.parse(content) as SessionState
        sessions.push({
          sessionId: state.sessionId,
          savedAt: state.savedAt,
          status: state.status,
          goal: state.goal.slice(0, 200),
        })
      }
      catch { /* skip malformed */ }
    }

    return sessions.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }
  catch {
    return []
  }
}

/**
 * Build a SessionState from the current engine loop state.
 */
export function buildSessionState(params: {
  sessionId: string
  goal: string
  workspacePath: string
  messages: QueryMessage[]
  filesModified: Set<string>
  turnsUsed: number
  toolCallsUsed: number
  tokensUsed: number
  anyEditMade: boolean
  turnsWithoutEdit: number
  lastAssistantContent: string
  status: SessionState['status']
}): SessionState {
  return {
    sessionId: params.sessionId,
    goal: params.goal,
    workspacePath: params.workspacePath,
    messages: params.messages,
    filesModified: Array.from(params.filesModified),
    turnsUsed: params.turnsUsed,
    toolCallsUsed: params.toolCallsUsed,
    tokensUsed: params.tokensUsed,
    anyEditMade: params.anyEditMade,
    turnsWithoutEdit: params.turnsWithoutEdit,
    lastAssistantContent: params.lastAssistantContent,
    savedAt: new Date().toISOString(),
    status: params.status,
  }
}
