import * as v from 'valibot'

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))

const SendMessageSchema = v.object({
  content: v.string(),
  id: NonEmptyStringSchema,
  role: v.string(),
})

export const SendMessagesRequestSchema = v.object({
  chatId: NonEmptyStringSchema,
  messages: v.array(SendMessageSchema),
})

export const PullMessagesRequestSchema = v.object({
  afterSeq: v.pipe(v.number(), v.integer(), v.minValue(0)),
  chatId: NonEmptyStringSchema,
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export type MessageRole = WireMessage['role']

export interface NewMessagesPayload {
  chatId: string
  fromSeq: number
  messages: WireMessage[]
  toSeq: number
}

export type PullMessagesRequest = v.InferOutput<typeof PullMessagesRequestSchema>

export interface PullMessagesResponse {
  messages: WireMessage[]
  seq: number
}

export type SendMessagesRequest = v.InferOutput<typeof SendMessagesRequestSchema>

export interface SendMessagesResponse {
  seq: number
}

export interface WireMessage {
  chatId: string
  content: string
  createdAt: number
  id: string
  role: 'assistant' | 'error' | 'system' | 'tool' | 'user'
  senderId: null | string
  seq: number
  updatedAt: number
}

/** Parses a `chat:pull-messages` payload at the WebSocket boundary. */
export function parsePullMessagesRequest(request: unknown): PullMessagesRequest {
  return v.parse(PullMessagesRequestSchema, request)
}

/** Parses a `chat:send-messages` payload at the WebSocket boundary. */
export function parseSendMessagesRequest(request: unknown): SendMessagesRequest {
  return v.parse(SendMessagesRequestSchema, request)
}
