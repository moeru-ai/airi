export interface ChatBroadcastPayload {
  chatId: string
  messages: unknown[]
  fromSeq: number
  toSeq: number
}

export interface ChatBroadcastMessage {
  userId: string
  payload: ChatBroadcastPayload
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${fieldName} must be a non-empty string`)

  return value
}

function assertFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${fieldName} must be a finite number`)

  return value
}

export function createChatBroadcastMessage(
  userId: string,
  payload: ChatBroadcastPayload,
): ChatBroadcastMessage {
  return {
    userId: assertNonEmptyString(userId, 'chat broadcast userId'),
    payload: {
      chatId: assertNonEmptyString(payload.chatId, 'chat broadcast payload.chatId'),
      messages: assertMessages(payload.messages),
      fromSeq: assertFiniteNumber(payload.fromSeq, 'chat broadcast payload.fromSeq'),
      toSeq: assertFiniteNumber(payload.toSeq, 'chat broadcast payload.toSeq'),
    },
  }
}

export function parseChatBroadcastMessage(raw: string): ChatBroadcastMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new TypeError('chat broadcast message is not valid JSON', { cause: error })
  }

  if (!parsed || typeof parsed !== 'object')
    throw new TypeError('chat broadcast message must be an object')

  const message = parsed as Record<string, unknown>
  const payload = message.payload

  if (!payload || typeof payload !== 'object')
    throw new TypeError('chat broadcast payload must be an object')

  const payloadRecord = payload as Record<string, unknown>

  return createChatBroadcastMessage(
    assertNonEmptyString(message.userId, 'chat broadcast userId'),
    {
      chatId: assertNonEmptyString(payloadRecord.chatId, 'chat broadcast payload.chatId'),
      messages: assertMessages(payloadRecord.messages),
      fromSeq: assertFiniteNumber(payloadRecord.fromSeq, 'chat broadcast payload.fromSeq'),
      toSeq: assertFiniteNumber(payloadRecord.toSeq, 'chat broadcast payload.toSeq'),
    },
  )
}

function assertMessages(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new TypeError('chat broadcast payload.messages must be an array')

  return value
}
