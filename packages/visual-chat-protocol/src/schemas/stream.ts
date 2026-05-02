import * as v from 'valibot'

export const TextMessageSchema = v.object({
  id: v.string(),
  role: v.picklist(['user', 'assistant', 'system']),
  content: v.string(),
  timestamp: v.number(),
  sourceId: v.optional(v.string()),
  model: v.optional(v.string()),
})

export const AudioChunkMetaSchema = v.object({
  sourceId: v.string(),
  timestamp: v.number(),
  sampleRate: v.literal(16000),
  channels: v.literal(1),
  durationMs: v.literal(1000),
})

export const VideoFrameMetaSchema = v.object({
  sourceId: v.string(),
  timestamp: v.number(),
  width: v.number(),
  height: v.number(),
  format: v.picklist(['jpeg', 'png']),
})

export type TextMessage = v.InferOutput<typeof TextMessageSchema>
export type AudioChunkMeta = v.InferOutput<typeof AudioChunkMetaSchema>
export type VideoFrameMeta = v.InferOutput<typeof VideoFrameMetaSchema>
