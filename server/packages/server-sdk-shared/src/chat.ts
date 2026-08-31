import * as v from 'valibot'

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))

const SendMessageSchema = v.object({
  id: NonEmptyStringSchema,
  role: v.string(),
  content: v.string(),
})

export const SendMessagesRequestSchema = v.object({
  chatId: NonEmptyStringSchema,
  messages: v.array(SendMessageSchema),
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
  seq: number
  createdAt: number
  updatedAt: number
}

export type MessageRole = WireMessage['role']

export type SendMessagesRequest = v.InferOutput<typeof SendMessagesRequestSchema>

export interface SendMessagesResponse {
  seq: number
}

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

/** Parses a `chat:pull-messages` payload at the WebSocket boundary. */
export function parsePullMessagesRequest(request: unknown): PullMessagesRequest {
  return v.parse(PullMessagesRequestSchema, request)
}
