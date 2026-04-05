// Inject timestamps before user/assistant prompt contents so the model can anchor each message in time.
// This helps avoid timeline confusion when earlier history contains different greetings or temporal references.
type CommonContentPart = {
  type: string
  [key: string]: unknown
}

type TimestampableMessage = {
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
