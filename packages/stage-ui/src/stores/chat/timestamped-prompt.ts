// Inject timestamps before user/assistant prompt contents so the model can anchor each message in time.
// This helps avoid timeline confusion when earlier history contains different greetings or temporal references.
interface CommonContentPart {
  type: string
  [key: string]: unknown
}

interface TimestampableMessage {
  role: string
  content: string | CommonContentPart[]
  createdAt?: number
  [key: string]: unknown
}

const TIMESTAMP_PREFIX_TEMPLATE = '[{timestamp}] {label}: '

export function formatPromptTimestamp(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function prefixPromptTimestamp(
  content: string | CommonContentPart[],
  prefix: string,
): string | CommonContentPart[] {
  if (typeof content === 'string')
    return `${prefix}${content}`

  if (content.length === 0)
    return [{ type: 'text', text: prefix }]

  const [first, ...rest] = content
  if (first.type === 'text') {
    return [
      { ...first, text: `${prefix}${first.text}` },
      ...rest,
    ]
  }

  return [{ type: 'text', text: prefix }, ...content]
}

export function formatMessageWithPromptTimestamps(message: TimestampableMessage): TimestampableMessage {
  if (message.role !== 'user' && message.role !== 'assistant')
    return message

  const label = message.role === 'user' ? 'User' : 'LLM'
  const timestamp = formatPromptTimestamp(message.createdAt ?? Date.now())
  const prefix = TIMESTAMP_PREFIX_TEMPLATE
    .replace('{timestamp}', timestamp)
    .replace('{label}', label)

  return {
    ...message,
    content: prefixPromptTimestamp(message.content, prefix),
  }
}

export function formatTimeDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0)
    parts.push(`${hours} hour${hours > 1 ? 's' : ''}`)
  if (minutes > 0)
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`)
  if (seconds > 0 && hours === 0 && minutes === 0)
    parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`)

  return parts.join(' ')
}

export function isSignificantTimegap(prevTimestamp: number, currentTimestamp: number): boolean {
  return (currentTimestamp - prevTimestamp) >= 30 * 60 * 1000
}

export function createTimegapNotification(prevTimestamp: number, currentTimestamp: number): TimestampableMessage {
  const duration = formatTimeDuration(currentTimestamp - prevTimestamp)
  return {
    role: 'system',
    content: `[${duration} have passed since the last message]`,
  }
}

export function injectTimegapNotifications(messages: TimestampableMessage[]): TimestampableMessage[] {
  if (messages.length === 0)
    return messages

  const result: TimestampableMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const current = messages[i]
    const currentTs = current.createdAt

    if (i > 0) {
      const prev = messages[i - 1]
      const prevTs = prev.createdAt

      if (prevTs != null && currentTs != null && isSignificantTimegap(prevTs, currentTs)) {
        result.push(createTimegapNotification(prevTs, currentTs))
      }
    }

    result.push(current)
  }

  return result
}
