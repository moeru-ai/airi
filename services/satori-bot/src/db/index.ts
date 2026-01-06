import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

interface Channel {
  id: string
  name: string
  platform: string
  selfId: string
}

interface Message {
  id: string
  channelId: string
  userId: string
  userName: string
  content: string
  timestamp: number
}

interface Database {
  channels: Channel[]
  messages: Message[]
}

const defaultData: Database = {
  channels: [],
  messages: [],
}

const file = join(__dirname, '../../data/db.json')
const adapter = new JSONFile<Database>(file)
const db = new Low<Database>(adapter, defaultData)

export async function initDb() {
  await db.read()
  db.data ||= defaultData
  await db.write()
}

export async function recordChannel(id: string, name: string, platform: string, selfId: string) {
  await db.read()

  // Find existing channel by ID only (platform/selfId may change on restart)
  const existingIndex = db.data.channels.findIndex(c => c.id === id)

  if (existingIndex >= 0) {
    // Update existing channel with new platform/selfId
    db.data.channels[existingIndex] = { id, name, platform, selfId }
    await db.write()
  }
  else {
    // Create new channel
    db.data.channels.push({ id, name, platform, selfId })
    await db.write()
  }
}

export async function listChannels(): Promise<Channel[]> {
  await db.read()
  return db.data.channels
}

export async function recordMessage(channelId: string, userId: string, userName: string, content: string) {
  await db.read()

  const message: Message = {
    id: `${channelId}-${userId}-${Date.now()}`,
    channelId,
    userId,
    userName,
    content,
    timestamp: Date.now(),
  }

  db.data.messages.push(message)

  // Keep only last 1000 messages
  if (db.data.messages.length > 1000) {
    db.data.messages = db.data.messages.slice(-1000)
  }

  await db.write()
}

export { db }
