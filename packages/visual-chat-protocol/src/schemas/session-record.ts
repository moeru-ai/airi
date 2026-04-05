import * as v from 'valibot'

export const SessionMemorySnapshotSchema = v.object({
  summary: v.string(),
  updatedAt: v.number(),
  sourceId: v.optional(v.string()),
})

export const SessionRecordSchema = v.object({
  sessionId: v.string(),
  roomName: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastMessageAt: v.nullable(v.number()),
  messageCount: v.number(),
  summary: v.string(),
  sceneMemory: v.optional(v.string()),
  memoryTimeline: v.optional(v.array(SessionMemorySnapshotSchema)),
})

export const SessionRecordsResponseSchema = v.object({
  records: v.array(SessionRecordSchema),
})

export type SessionRecord = v.InferOutput<typeof SessionRecordSchema>
export type SessionRecordsResponse = v.InferOutput<typeof SessionRecordsResponseSchema>
export type SessionMemorySnapshot = v.InferOutput<typeof SessionMemorySnapshotSchema>
