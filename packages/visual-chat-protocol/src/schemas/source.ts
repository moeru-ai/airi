import * as v from 'valibot'

export const SourceTypeSchema = v.picklist([
  'phone-camera',
  'laptop-camera',
  'screen-share',
  'phone-mic',
  'laptop-mic',
])

export const SourceDescriptorSchema = v.object({
  sourceId: v.string(),
  participantIdentity: v.string(),
  trackSid: v.string(),
  sourceType: SourceTypeSchema,
  isActive: v.boolean(),
  lastFrameTimestamp: v.number(),
})

export const SourceSwitchRequestSchema = v.object({
  sourceType: SourceTypeSchema,
  sourceId: v.optional(v.string()),
})

export type SourceDescriptor = v.InferOutput<typeof SourceDescriptorSchema>
export type SourceSwitchRequest = v.InferOutput<typeof SourceSwitchRequestSchema>
