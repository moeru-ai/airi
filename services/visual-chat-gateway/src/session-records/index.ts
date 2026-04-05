import type { SessionMemorySnapshot, SessionRecord, TextMessage } from '@proj-airi/visual-chat-protocol'

import { listSessionIds, loadSessionMessages, loadSessionMetadata, saveSessionMessages, saveSessionMetadata } from '@proj-airi/visual-chat-storage'

const WHITESPACE_PATTERN = /\s+/g

function normalizeTitle(messages: TextMessage[]): string {
  const firstUserMessage = messages.find(message => message.role === 'user' && message.content.trim())
  if (!firstUserMessage)
    return 'New visual chat'

  const singleLine = firstUserMessage.content.replace(WHITESPACE_PATTERN, ' ').trim()
  return singleLine.length > 60
    ? `${singleLine.slice(0, 57)}...`
    : singleLine
}

function normalizeSummary(messages: TextMessage[]): string {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find(message => message.role === 'assistant' && message.content.trim())

  if (!lastAssistantMessage)
    return ''

  const singleLine = lastAssistantMessage.content.replace(WHITESPACE_PATTERN, ' ').trim()
  return singleLine.length > 120
    ? `${singleLine.slice(0, 117)}...`
    : singleLine
}

function buildDefaultRecord(sessionId: string): SessionRecord {
  const now = Date.now()
  return {
    sessionId,
    roomName: `visual-chat-${sessionId.slice(0, 8)}`,
    title: 'New visual chat',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    messageCount: 0,
    summary: '',
    sceneMemory: '',
    memoryTimeline: [],
  }
}

function clampMemoryTimeline(timeline: SessionMemorySnapshot[]): SessionMemorySnapshot[] {
  if (timeline.length <= 6)
    return timeline
  return timeline.slice(-6)
}

export class SessionRecordRepository {
  async getRecord(sessionId: string): Promise<SessionRecord | null> {
    const metadata = await loadSessionMetadata(sessionId)
    if (!metadata)
      return null

    const record = metadata.record
    if (!record || typeof record !== 'object')
      return null

    return {
      ...buildDefaultRecord(sessionId),
      ...(record as Partial<SessionRecord>),
      sessionId,
    }
  }

  async ensureRecord(sessionId: string, roomName?: string): Promise<SessionRecord> {
    const existing = await this.getRecord(sessionId)
    if (existing)
      return existing

    const created = {
      ...buildDefaultRecord(sessionId),
      roomName: roomName || `visual-chat-${sessionId.slice(0, 8)}`,
    } satisfies SessionRecord

    await saveSessionMetadata(sessionId, { record: created })
    return created
  }

  async saveMessages(sessionId: string, messages: TextMessage[], options?: { roomName?: string, sceneMemory?: string }): Promise<SessionRecord> {
    const existing = await this.ensureRecord(sessionId, options?.roomName)
    const createdAt = existing.createdAt || Date.now()
    const lastMessageAt = messages.at(-1)?.timestamp ?? existing.lastMessageAt ?? null

    const nextRecord = {
      ...existing,
      roomName: options?.roomName || existing.roomName,
      title: normalizeTitle(messages),
      updatedAt: Date.now(),
      lastMessageAt,
      messageCount: messages.length,
      summary: normalizeSummary(messages),
      sceneMemory: options?.sceneMemory ?? existing.sceneMemory ?? '',
      memoryTimeline: existing.memoryTimeline ?? [],
      createdAt,
    } satisfies SessionRecord

    await saveSessionMessages(sessionId, messages)
    await saveSessionMetadata(sessionId, { record: nextRecord })
    return nextRecord
  }

  async updateSceneMemory(
    sessionId: string,
    sceneMemory: string,
    options?: { roomName?: string, sourceId?: string, updatedAt?: number },
  ): Promise<SessionRecord> {
    const existing = await this.ensureRecord(sessionId, options?.roomName)
    const messages = await loadSessionMessages(sessionId)
    const updatedAt = options?.updatedAt ?? Date.now()
    const nextSnapshot = {
      summary: sceneMemory,
      updatedAt,
      sourceId: options?.sourceId,
    } satisfies SessionMemorySnapshot
    const previousTimeline = existing.memoryTimeline ?? []
    const lastSnapshot = previousTimeline.at(-1)
    const nextTimeline = clampMemoryTimeline(
      lastSnapshot?.summary === sceneMemory
        ? [...previousTimeline.slice(0, -1), nextSnapshot]
        : [...previousTimeline, nextSnapshot],
    )
    const nextRecord = {
      ...existing,
      roomName: options?.roomName || existing.roomName,
      updatedAt,
      sceneMemory,
      memoryTimeline: nextTimeline,
    } satisfies SessionRecord

    await saveSessionMetadata(sessionId, { record: nextRecord })
    if (messages.length > 0)
      await saveSessionMessages(sessionId, messages)
    return nextRecord
  }

  async loadMessages(sessionId: string): Promise<TextMessage[]> {
    return loadSessionMessages(sessionId)
  }

  async listRecords(): Promise<SessionRecord[]> {
    const sessionIds = await listSessionIds()
    const records = await Promise.all(sessionIds.map(sessionId => this.getRecord(sessionId)))
    return records
      .filter((record): record is SessionRecord => record !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }
}
