import type { InferOutput } from 'valibot'

import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  string,
  union,
} from 'valibot'

export const HermesRouteSchema = union([
  literal('normal'),
  literal('nsfw'),
])

export const HermesSubscriptionTierSchema = union([
  literal('free'),
  literal('premium'),
  literal('vip'),
])

export const HermesContentTierSchema = union([
  literal('standard'),
  literal('sensitive'),
  literal('explicit'),
])

export const HermesCharacterVisibilitySchema = union([
  literal('private'),
  literal('public'),
  literal('unlisted'),
])

export const HermesCharacterRelationshipModeSchema = union([
  literal('companion'),
  literal('romance'),
  literal('roleplay'),
])

export const HermesCharacterNsfwLevelSchema = union([
  literal('none'),
  literal('suggestive'),
  literal('explicit'),
])

export const HermesCharacterMemoryProfileSchema = union([
  literal('light'),
  literal('standard'),
  literal('deep'),
])

export const HermesChatMessageRoleSchema = union([
  literal('system'),
  literal('user'),
  literal('assistant'),
  literal('tool'),
  literal('error'),
])

export const HermesSceneTypeSchema = union([
  literal('general'),
  literal('romance'),
  literal('roleplay'),
  literal('nsfw'),
  literal('support'),
])

export const HermesUserContextSchema = object({
  id: string(),
  adultVerified: boolean(),
  allowSensitiveContent: boolean(),
  subscriptionTier: HermesSubscriptionTierSchema,
  contentTier: HermesContentTierSchema,
})

export const HermesPersonaProfileSchema = object({
  personality: optional(string()),
  scenario: optional(string()),
  speakingStyle: optional(string()),
  starterMessages: optional(array(string())),
  boundaries: optional(array(string())),
  memoryProfile: optional(HermesCharacterMemoryProfileSchema),
})

export const HermesCharacterContextSchema = object({
  id: string(),
  visibility: HermesCharacterVisibilitySchema,
  relationshipMode: HermesCharacterRelationshipModeSchema,
  nsfwEnabled: boolean(),
  nsfwLevel: HermesCharacterNsfwLevelSchema,
  personaProfile: HermesPersonaProfileSchema,
})

export const HermesConversationMessageSchema = object({
  id: optional(string()),
  role: HermesChatMessageRoleSchema,
  content: string(),
})

export const HermesConversationContextSchema = object({
  id: string(),
  recentMessages: array(HermesConversationMessageSchema),
})

export const HermesReplyRequestSchema = object({
  requestId: string(),
  route: HermesRouteSchema,
  user: HermesUserContextSchema,
  character: HermesCharacterContextSchema,
  conversation: HermesConversationContextSchema,
  message: HermesConversationMessageSchema,
})

export const HermesImagePromptRequestSchema = object({
  requestId: string(),
  route: HermesRouteSchema,
  user: HermesUserContextSchema,
  character: HermesCharacterContextSchema,
  prompt: string(),
  style: optional(string()),
  mood: optional(string()),
  framing: optional(string()),
  aspectRatio: optional(string()),
})

export const HermesRuntimeSelectionSchema = object({
  replyModel: string(),
  routerModel: string(),
  memoryModel: string(),
})

export const HermesMemoryUpdatesSchema = object({
  summaryAppend: optional(string()),
  factsAdd: array(string()),
  factsRemove: array(string()),
})

export const HermesJudgeResultSchema = object({
  score: nullable(number()),
  flags: array(string()),
})

export const HermesReplyResponseSchema = object({
  requestId: string(),
  route: HermesRouteSchema,
  reply: HermesConversationMessageSchema,
  runtime: HermesRuntimeSelectionSchema,
  memoryUpdates: HermesMemoryUpdatesSchema,
  judge: HermesJudgeResultSchema,
  sceneType: optional(HermesSceneTypeSchema),
})

export const HermesImagePromptResponseSchema = object({
  requestId: string(),
  route: HermesRouteSchema,
  prompt: string(),
  negativePrompt: string(),
  tags: array(string()),
  sceneType: optional(HermesSceneTypeSchema),
})

export type HermesRoute = InferOutput<typeof HermesRouteSchema>
export type HermesSubscriptionTier = InferOutput<typeof HermesSubscriptionTierSchema>
export type HermesContentTier = InferOutput<typeof HermesContentTierSchema>
export type HermesUserContext = InferOutput<typeof HermesUserContextSchema>
export type HermesPersonaProfile = InferOutput<typeof HermesPersonaProfileSchema>
export type HermesCharacterContext = InferOutput<typeof HermesCharacterContextSchema>
export type HermesConversationMessage = InferOutput<typeof HermesConversationMessageSchema>
export type HermesConversationContext = InferOutput<typeof HermesConversationContextSchema>
export type HermesReplyRequest = InferOutput<typeof HermesReplyRequestSchema>
export type HermesImagePromptRequest = InferOutput<typeof HermesImagePromptRequestSchema>
export type HermesRuntimeSelection = InferOutput<typeof HermesRuntimeSelectionSchema>
export type HermesMemoryUpdates = InferOutput<typeof HermesMemoryUpdatesSchema>
export type HermesJudgeResult = InferOutput<typeof HermesJudgeResultSchema>
export type HermesReplyResponse = InferOutput<typeof HermesReplyResponseSchema>
export type HermesImagePromptResponse = InferOutput<typeof HermesImagePromptResponseSchema>
