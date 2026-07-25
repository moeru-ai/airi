import { array, check, finite, number, object, parse, pipe, string, unknown } from 'valibot'

const NonEmptyChatBroadcastUserIdSchema = pipe(
  string('chat broadcast userId must be a non-empty string'),
  check(value => value.trim().length > 0, 'chat broadcast userId must be a non-empty string'),
)

const NonEmptyChatBroadcastChatIdSchema = pipe(
  string('chat broadcast payload.chatId must be a non-empty string'),
  check(value => value.trim().length > 0, 'chat broadcast payload.chatId must be a non-empty string'),
)

const ChatBroadcastMessagesSchema = array(
  unknown(),
  'chat broadcast payload.messages must be an array',
)

const ChatBroadcastFromSeqSchema = pipe(
  number('chat broadcast payload.fromSeq must be a finite number'),
  finite('chat broadcast payload.fromSeq must be a finite number'),
)

const ChatBroadcastToSeqSchema = pipe(
  number('chat broadcast payload.toSeq must be a finite number'),
  finite('chat broadcast payload.toSeq must be a finite number'),
)

const NonEmptyChatBroadcastOriginInstanceIdSchema = pipe(
  string('chat broadcast originInstanceId must be a non-empty string'),
  check(value => value.trim().length > 0, 'chat broadcast originInstanceId must be a non-empty string'),
)

const ChatBroadcastPayloadSchema = object({
  chatId: NonEmptyChatBroadcastChatIdSchema,
  messages: ChatBroadcastMessagesSchema,
  fromSeq: ChatBroadcastFromSeqSchema,
  toSeq: ChatBroadcastToSeqSchema,
})

const ChatBroadcastMessageSchema = object({
  userId: NonEmptyChatBroadcastUserIdSchema,
  payload: ChatBroadcastPayloadSchema,
  originInstanceId: NonEmptyChatBroadcastOriginInstanceIdSchema,
})

export interface ChatBroadcastPayload {
  chatId: string
  messages: unknown[]
  fromSeq: number
  toSeq: number
}

export interface ChatBroadcastMessage {
  userId: string
  payload: ChatBroadcastPayload
  /**
   * Stable identifier of the api instance that published this broadcast.
   *
   * The subscribing instance compares it with its own instance id and skips
   * delivery to local peers when they match — the publisher already
   * delivered locally via `broadcastToLocalDevices` and re-delivering would
   * echo every message twice on the originating instance (and once extra on
   * the sender's own ctx).
   */
  originInstanceId: string
}

/**
 * Build a normalized chat broadcast message ready for `redis.publish`.
 *
 * Use when:
 * - The chat-ws route has just persisted new messages and needs to fan them
 *   out to other api instances over the user's pub/sub channel.
 *
 * Expects:
 * - `originInstanceId` is the publisher's stable instance id (env or nanoid
 *   fallback). It must be non-empty so the echo-skip filter on the
 *   subscriber side is reliable.
 *
 * Returns:
 * - The validated message object; callers `JSON.stringify` it before
 *   `redis.publish`.
 */
export function createChatBroadcastMessage(
  userId: string,
  payload: ChatBroadcastPayload,
  originInstanceId: string,
): ChatBroadcastMessage {
  return parse(ChatBroadcastMessageSchema, { userId, payload, originInstanceId })
}

/**
 * Parse a raw redis pub/sub message back into a validated broadcast message.
 *
 * Use when:
 * - A subscribing api instance received a message and needs to decide
 *   whether to deliver it to local peers.
 *
 * Expects:
 * - The raw message is JSON produced by `createChatBroadcastMessage`.
 *
 * Returns:
 * - A fully validated `ChatBroadcastMessage`. Throws on schema violations so
 *   bad messages do not silently corrupt the local registry.
 */
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

  return parse(ChatBroadcastMessageSchema, {
    userId: message.userId,
    payload: {
      chatId: payloadRecord.chatId,
      messages: payloadRecord.messages,
      fromSeq: payloadRecord.fromSeq,
      toSeq: payloadRecord.toSeq,
    },
    originInstanceId: message.originInstanceId,
  })
}
