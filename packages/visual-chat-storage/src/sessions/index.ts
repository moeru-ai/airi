import type { TextMessage } from '@proj-airi/visual-chat-protocol'

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { normalizeVisualChatSessionId } from '@proj-airi/visual-chat-shared'

import { ensureDir } from '../paths'

export async function getSessionDir(sessionId: string): Promise<string> {
  const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
  const dataDir = await ensureDir('data')
  const dir = join(dataDir, 'sessions', normalizedSessionId)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function saveSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
  const dir = await getSessionDir(sessionId)
  await writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')
}

export async function loadSessionMetadata(sessionId: string): Promise<Record<string, unknown> | null> {
  try {
    const dir = await getSessionDir(sessionId)
    const raw = await readFile(join(dir, 'metadata.json'), 'utf-8')
    return JSON.parse(raw)
  }
  catch {
    return null
  }
}

export async function saveSessionMessages(sessionId: string, messages: TextMessage[]): Promise<void> {
  const dir = await getSessionDir(sessionId)
  await writeFile(join(dir, 'messages.json'), JSON.stringify(messages, null, 2), 'utf-8')
}

export async function loadSessionMessages(sessionId: string): Promise<TextMessage[]> {
  try {
    const dir = await getSessionDir(sessionId)
    const raw = await readFile(join(dir, 'messages.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as TextMessage[] : []
  }
  catch {
    return []
  }
}

export async function listSessionIds(): Promise<string[]> {
  try {
    const dataDir = await ensureDir('data')
    const sessionsDir = join(dataDir, 'sessions')
    const entries = await readdir(sessionsDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter((sessionId) => {
        try {
          normalizeVisualChatSessionId(sessionId)
          return true
        }
        catch {
          return false
        }
      })
  }
  catch {
    return []
  }
}

/** Removes persisted session files (the session directory under data/sessions). */
export async function deleteSessionData(sessionId: string): Promise<void> {
  const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
  const dataDir = await ensureDir('data')
  const sessionDir = join(dataDir, 'sessions', normalizedSessionId)
  await rm(sessionDir, { recursive: true, force: true })
}
