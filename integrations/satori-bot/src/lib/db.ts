import type { SatoriEvent } from '../adapter/satori/types'
import type { StoredUnreadEvent } from '../core/types'

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { nanoid } from 'nanoid'

import { config } from '../config'

import * as schema from './schema'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const dbPath = resolve(__dirname, config.db.path)

// Initialize PGlite and Drizzle
const client = new PGlite(dbPath)
export const db = drizzle(client, { schema })

export async function initDb() {
  // Execute migrations
  const migrationsPath = resolve(__dirname, '../../drizzle')
  await migrate(db, { migrationsFolder: migrationsPath })
}

export const { channels, messages, eventQueue, unreadEvents } = schema

export async function recordChannel(id: string, name: string, platform: string, selfId: string) {
  await db.insert(channels)
    .values({ id, name, platform, selfId })
    .onConflictDoUpdate({
      target: channels.id,
      set: { name, platform, selfId },
    })
}

export async function listChannels() {
  return await db.select().from(channels)
}

export async function recordMessage(channelId: string, userId: string, userName: string, content: string, timestamp?: number) {
  const ts = timestamp || Date.now()
  const id = nanoid()

  await db.insert(messages).values({
    id,
    channelId,
    userId,
    userName,
    content,
    timestamp: ts,
  })
}

/**
 * Retrieves the most recent messages for a specific channel.
 */
export async function getRecentMessages(channelId: string, limit: number = 10) {
  return await db.select()
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(desc(messages.timestamp))
    .limit(limit)
    .then(msgs => msgs.reverse())
}

// Event Queue Persistence

export async function pushToEventQueue(item: { event: SatoriEvent, status: 'pending' | 'ready' }) {
  const id = nanoid()
  await db.insert(eventQueue).values({
    id,
    event: item.event,
    status: item.status,
    createdAt: Date.now(),
  })
  return id
}

export async function removeFromEventQueue(id: string) {
  await db.delete(eventQueue).where(eq(eventQueue.id, id))
}

export async function clearEventQueue() {
  await db.delete(eventQueue)
}

export async function saveEventQueue(queue: { id?: string, event: SatoriEvent, status: 'pending' | 'ready' }[]) {
  // If we have IDs, we might be able to do something smarter, but for now let's just keep it as is
  // but optimized for the common case where we might want to just replace all.
  // Actually, the best way to handle this is to NOT use saveEventQueue for single items.
  await db.delete(eventQueue)
  if (queue.length > 0) {
    await db.insert(eventQueue).values(queue.map(item => ({
      id: item.id || nanoid(),
      event: item.event,
      status: item.status,
      createdAt: Date.now(),
    })))
  }
}

export async function loadEventQueue() {
  const result = await db.select().from(eventQueue).orderBy(schema.eventQueue.createdAt)
  return result.map(r => ({
    id: r.id,
    event: r.event as SatoriEvent,
    status: r.status as 'pending' | 'ready',
  }))
}

// Unread Events Persistence

export async function pushToUnreadEvents(channelId: string, event: SatoriEvent) {
  const id = nanoid()
  await db.insert(unreadEvents).values({
    id,
    channelId,
    event,
    createdAt: Date.now(),
  })
  return id
}

export async function deleteUnreadEventsByIds(channelId: string, ids: string[]) {
  if (ids.length === 0)
    return
  await db.delete(unreadEvents).where(inArray(unreadEvents.id, ids))
}

export async function clearUnreadEventsForChannel(channelId: string) {
  await db.delete(unreadEvents).where(eq(unreadEvents.channelId, channelId))
}

export async function saveUnreadEvents(allUnread: Record<string, StoredUnreadEvent[]>) {
  await db.delete(unreadEvents)
  const values = []
  for (const [channelId, events] of Object.entries(allUnread)) {
    for (const item of events) {
      values.push({
        id: item.id || nanoid(),
        channelId,
        event: item.event,
        createdAt: Date.now(),
      })
    }
  }
  if (values.length > 0) {
    await db.insert(unreadEvents).values(values)
  }
}

export async function loadUnreadEvents() {
  const result = await db.select().from(unreadEvents).orderBy(schema.unreadEvents.createdAt)
  const allUnread: Record<string, StoredUnreadEvent[]> = {}
  for (const r of result) {
    if (!allUnread[r.channelId]) {
      allUnread[r.channelId] = []
    }
    allUnread[r.channelId].push({
      id: r.id,
      event: r.event as SatoriEvent,
    })
  }
  return allUnread
}
