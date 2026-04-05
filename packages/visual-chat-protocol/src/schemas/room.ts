import * as v from 'valibot'

export const RoomCreateRequestSchema = v.object({
  roomName: v.optional(v.string()),
})

export const RoomInfoSchema = v.object({
  roomName: v.string(),
  participantCount: v.number(),
  createdAt: v.number(),
  activeSessionId: v.nullable(v.string()),
})

export type RoomCreateRequest = v.InferOutput<typeof RoomCreateRequestSchema>
export type RoomInfo = v.InferOutput<typeof RoomInfoSchema>
