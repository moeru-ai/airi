import * as v from 'valibot'

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))

const SendMessageSchema = v.object({
  id: NonEmptyStringSchema,
  role: v.string(),
  content: v.string(),
  replyToMessageId: v.optional(NonEmptyStringSchema),
})

export const SendMessagesRequestSchema = v.object({
  chatId: NonEmptyStringSchema,
  messages: v.array(SendMessageSchema),
})

export const DeleteMessagesRequestSchema = v.object({
  chatId: NonEmptyStringSchema,
  messageIds: v.pipe(v.array(NonEmptyStringSchema), v.minLength(1)),
})

export const PullMessagesRequestSchema = v.object({
  chatId: NonEmptyStringSchema,
  afterSeq: v.pipe(v.number(), v.integer(), v.minValue(0)),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export interface WireMessage {
  id: string
  chatId: string
  senderId: string | null
  role: 'system' | 'user' | 'assistant' | 'tool' | 'error'
  content: string
  replyToMessageId?: string | null
  seq: number
  createdAt: number
  updatedAt: number
  /**
   * Set when the message was deleted. A deleted message is a tombstone: its
   * `content` is empty, and `seq` is the sequence number of the deletion.
   */
  deletedAt?: number | null
}

export type MessageRole = WireMessage['role']

export type SendMessagesRequest = v.InferOutput<typeof SendMessagesRequestSchema>

export interface SendMessagesResponse {
  seq: number
}

export type DeleteMessagesRequest = v.InferOutput<typeof DeleteMessagesRequestSchema>

export const DeleteMessagesResponseSchema = v.object({
  seq: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type DeleteMessagesResponse = v.InferOutput<typeof DeleteMessagesResponseSchema>

export type PullMessagesRequest = v.InferOutput<typeof PullMessagesRequestSchema>

export interface PullMessagesResponse {
  messages: WireMessage[]
  seq: number
}

export interface NewMessagesPayload {
  chatId: string
  messages: WireMessage[]
  fromSeq: number
  toSeq: number
}

/** Parses a `chat:send-messages` payload at the WebSocket boundary. */
export function parseSendMessagesRequest(request: unknown): SendMessagesRequest {
  return v.parse(SendMessagesRequestSchema, request)
}

/** Parses a `chat:delete-messages` payload at the WebSocket boundary. */
export function parseDeleteMessagesRequest(request: unknown): DeleteMessagesRequest {
  return v.parse(DeleteMessagesRequestSchema, request)
}

/** Parses a `chat:pull-messages` payload at the WebSocket boundary. */
export function parsePullMessagesRequest(request: unknown): PullMessagesRequest {
  return v.parse(PullMessagesRequestSchema, request)
}
