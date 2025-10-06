import type { Message } from '../interfaces/memory.interface'

type SerializableMessage = Omit<Message, 'timestamp'> & { timestamp: string }

export function serializeMessage(message: Message): string {
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp.toISOString()
    : new Date(message.timestamp).toISOString()

  const serializable: SerializableMessage = {
    ...message,
    timestamp,
  }

  return JSON.stringify(serializable)
}

export function deserializeMessage(payload: string): Message {
  const raw = JSON.parse(payload) as SerializableMessage
  return {
    ...raw,
    timestamp: new Date(raw.timestamp),
  }
}
