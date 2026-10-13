import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { app } from 'electron'

/**
 * The folder the desktop agent may read and write.
 *
 * The value is cached because the tool path reads it on every call, and a disk
 * read per tool call would be wasteful. A missing or unreadable file falls back
 * to the default folder, so a broken config never blocks the tools.
 */
let cached: string | undefined

export function configPath(): string {
  return join(app.getPath('userData'), 'desktop-agent.json')
}

/** The folder the agent works in when the user has not chosen one. */
export function defaultWorkspace(): string {
  return join(app.getPath('userData'), 'agent-workspace')
}

export async function readWorkspace(): Promise<string> {
  if (cached !== undefined)
    return cached

  try {
    const raw = await readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as { workspace?: unknown }
    const workspace = typeof parsed.workspace === 'string' ? parsed.workspace.trim() : ''
    cached = workspace.length > 0 ? workspace : defaultWorkspace()
  }
  catch {
    cached = defaultWorkspace()
  }

  // A file tool reports a missing directory as a failure, and the default
  // folder has never been created on a fresh install. Creating it here means
  // the first listing shows an empty folder instead of an error.
  await mkdir(cached, { recursive: true }).catch(() => undefined)
  return cached
}

/** Stores the workspace folder and returns the value that is now in force. */
export async function writeWorkspace(workspace: string): Promise<string> {
  const next = workspace.trim().length > 0 ? workspace.trim() : defaultWorkspace()
  const file = configPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ workspace: next }, null, 2), 'utf8')
  cached = next
  // The folder must exist before the first file tool runs, because several of
  // them report a missing directory as a failure.
  await mkdir(next, { recursive: true }).catch(() => undefined)
  return next
}
