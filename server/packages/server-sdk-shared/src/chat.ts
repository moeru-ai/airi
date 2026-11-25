import * as v from 'valibot'

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))
const AttachmentIdSchema = v.pipe(v.string(), v.regex(/^[\w-]{1,128}$/))
const Sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))
const MediaIdsSchema = v.pipe(
  v.array(AttachmentIdSchema),
  v.maxLength(4),
  v.check(mediaIds => new Set(mediaIds).size === mediaIds.length, 'mediaIds must not contain duplicates'),
)

const SendMessageSchema = v.object({
  id: NonEmptyStringSchema,
  role: v.string(),
  content: v.string(),
  mediaIds: v.optional(MediaIdsSchema),
  replyToMessageId: v.optional(NonEmptyStringSchema),
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

const ImageThumbnailSchema = v.object({
  hash: v.pipe(v.string(), v.minLength(20), v.maxLength(40), v.base64()),
  width: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  height: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
})

export type ImageThumbnail = v.InferOutput<typeof ImageThumbnailSchema>

export const WireAttachmentSchema = v.object({
  id: AttachmentIdSchema,
  mimeType: NonEmptyStringSchema,
  size: v.pipe(v.number(), v.integer(), v.minValue(1)),
  thumbnail: v.optional(ImageThumbnailSchema),
})

export type WireAttachment = v.InferOutput<typeof WireAttachmentSchema>

export const ChatImageMimeTypeSchema = v.picklist(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export const CreateAttachmentRequestSchema = v.object({
  id: AttachmentIdSchema,
  mimeType: ChatImageMimeTypeSchema,
  sha256: Sha256Schema,
  size: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3 * 1024 * 1024)),
  thumbnail: v.optional(ImageThumbnailSchema),
})

export const CreateAttachmentResponseSchema = v.object({
  attachment: WireAttachmentSchema,
  upload: v.nullable(v.object({
    headers: v.record(v.string(), v.string()),
    url: v.pipe(v.string(), v.url()),
  })),
})

export const DownloadAttachmentResponseSchema = v.object({
  attachment: WireAttachmentSchema,
  url: v.pipe(v.string(), v.url()),
  sha256: Sha256Schema,
})

export type CreateAttachmentRequest = v.InferOutput<typeof CreateAttachmentRequestSchema>
export type CreateAttachmentResponse = v.InferOutput<typeof CreateAttachmentResponseSchema>
export type DownloadAttachmentResponse = v.InferOutput<typeof DownloadAttachmentResponseSchema>

const WireMessageSchema = v.object({
  id: NonEmptyStringSchema,
  chatId: NonEmptyStringSchema,
  senderId: v.nullable(v.string()),
  role: v.picklist(['system', 'user', 'assistant', 'tool', 'error']),
  content: v.string(),
  attachments: v.optional(v.array(WireAttachmentSchema)),
  replyToMessageId: v.optional(v.nullable(v.string())),
  seq: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export type WireMessage = v.InferOutput<typeof WireMessageSchema>

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

export const NewMessagesPayloadSchema = v.object({
  chatId: NonEmptyStringSchema,
  messages: v.array(WireMessageSchema),
  fromSeq: v.number(),
  toSeq: v.number(),
})

export type NewMessagesPayload = v.InferOutput<typeof NewMessagesPayloadSchema>

/** Parses a `chat:send-messages` payload at the WebSocket boundary. */
export function parseSendMessagesRequest(request: unknown): SendMessagesRequest {
  return v.parse(SendMessagesRequestSchema, request)
}

/** Parses a `chat:pull-messages` payload at the WebSocket boundary. */
export function parsePullMessagesRequest(request: unknown): PullMessagesRequest {
  return v.parse(PullMessagesRequestSchema, request)
}
