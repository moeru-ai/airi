import { bigint, index, json, pgTable, text } from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  selfId: text('self_id').notNull(),
})

export const messages = pgTable('messages', {
  channelId: text('channel_id').notNull(),
  content: text('content').notNull(),
  id: text('id').primaryKey(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
}, (table) => {
  return [
    index('channel_timestamp_idx').on(table.channelId, table.timestamp),
  ]
})

export const eventQueue = pgTable('event_queue', {
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  event: json('event').notNull(),
  id: text('id').primaryKey(),
  status: text('status').notNull(), // 'pending' | 'ready'
})

export const unreadEvents = pgTable('unread_events', {
  channelId: text('channel_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  event: json('event').notNull(),
  id: text('id').primaryKey(),
})
