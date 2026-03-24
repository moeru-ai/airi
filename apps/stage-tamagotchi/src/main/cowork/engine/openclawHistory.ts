import {
  parseScheduledReminderPrompt,
  parseSimpleScheduledReminderText,
} from '../../common/scheduledReminderText'

type GatewayHistoryRole = 'user' | 'assistant' | 'system'

export interface GatewayHistoryEntry {
  role: GatewayHistoryRole
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function extractGatewayMessageText(message: unknown): string {
  if (typeof message === 'string') {
    return message
  }
  if (!isRecord(message)) {
    return ''
  }

  const content = message.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const item of content) {
      if (!isRecord(item))
        continue
      if (item.type === 'text' && typeof item.text === 'string') {
        chunks.push(item.text)
      }
    }
    if (chunks.length > 0) {
      return chunks.join('\n')
    }
  }
  if (typeof message.text === 'string') {
    return message.text
  }
  return ''
}

export function buildScheduledReminderSystemMessage(text: string): string | null {
  const parsed = parseScheduledReminderPrompt(text)
  if (!parsed) {
    return parseSimpleScheduledReminderText(text)?.reminderText ?? null
  }

  return parsed.reminderText
}

export function extractGatewayHistoryEntry(message: unknown): GatewayHistoryEntry | null {
  if (!isRecord(message)) {
    return null
  }

  const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : ''
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return null
  }

  const text = extractGatewayMessageText(message).trim()
  if (!text) {
    return null
  }

  const reminderSystemMessage = role === 'user'
    ? buildScheduledReminderSystemMessage(text)
    : null
  if (reminderSystemMessage) {
    return {
      role: 'system',
      text: reminderSystemMessage,
    }
  }

  return {
    role,
    text,
  }
}

export function extractGatewayHistoryEntries(messages: unknown[]): GatewayHistoryEntry[] {
  return messages
    .map(message => extractGatewayHistoryEntry(message))
    .filter((entry): entry is GatewayHistoryEntry => entry !== null)
}
