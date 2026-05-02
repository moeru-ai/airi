import * as v from 'valibot'

import { SourceDescriptorSchema } from './source'

export const InteractionModeSchema = v.literal('vision-text-realtime')

export const SessionStateSchema = v.picklist([
  'idle',
  'connected',
  'ready',
  'listening',
  'selecting-source',
  'inference',
  'responding',
  'suspended',
])

export const InferenceStateSchema = v.object({
  isRunning: v.boolean(),
  currentCnt: v.number(),
  lastLatencyMs: v.optional(v.number()),
  errorCount: v.number(),
})

export const SessionContextSchema = v.object({
  sessionId: v.string(),
  roomName: v.string(),
  mode: InteractionModeSchema,
  state: SessionStateSchema,

  activeVideoSource: v.nullable(SourceDescriptorSchema),
  activeAudioSource: v.nullable(SourceDescriptorSchema),
  standbyVideoSources: v.array(SourceDescriptorSchema),
  standbyAudioSources: v.array(SourceDescriptorSchema),

  inferenceState: InferenceStateSchema,
  createdAt: v.number(),
  lastActivityAt: v.number(),
})

export type InteractionMode = v.InferOutput<typeof InteractionModeSchema>
export type SessionState = v.InferOutput<typeof SessionStateSchema>
export type InferenceState = v.InferOutput<typeof InferenceStateSchema>
export type SessionContext = v.InferOutput<typeof SessionContextSchema>
