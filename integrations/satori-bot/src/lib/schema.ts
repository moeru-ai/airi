import { bigint, index, json, pgTable, text } from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  selfId: text('self_id').notNull(),
})

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  content: text('content').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
}, (table) => {
  return [
    index('channel_timestamp_idx').on(table.channelId, table.timestamp),
  ]
})

export const eventQueue = pgTable('event_queue', {
  id: text('id').primaryKey(),
  event: json('event').notNull(),
  status: text('status').notNull(), // 'pending' | 'ready'
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

export const unreadEvents = pgTable('unread_events', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull(),
  event: json('event').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})
