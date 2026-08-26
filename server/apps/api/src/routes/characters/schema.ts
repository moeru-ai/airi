import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { array, literal, number, object, optional, pipe, string, transform, union } from 'valibot'

import * as schema from '../../schemas/characters'

export const AvatarModelConfigSchema = object({
  live2d: optional(object({
    urls: array(string()),
  })),
  vrm: optional(object({
    urls: array(string()),
  })),
})

export const CharacterCapabilityConfigSchema = object({
  apiBaseUrl: string(),
  apiKey: string(),
  asr: optional(object({
    audio: string(),
  })),
  llm: optional(object({
    model: string(),
    temperature: number(),
  })),
  tts: optional(object({
    pitch: number(),
    speed: number(),
    ssml: string(),
    voiceId: string(),
  })),
  vlm: optional(object({
    image: string(),
  })),
})

const CharacterCapabilityTypeSchema = union([
  literal('llm'),
  literal('tts'),
  literal('vlm'),
  literal('asr'),
])

const AvatarModelTypeSchema = union([
  literal('vrm'),
  literal('live2d'),
])

export const CharacterSchema = createSelectSchema(schema.character)
export const InsertCharacterSchema = createInsertSchema(schema.character)

export const AvatarModelSchema = createSelectSchema(schema.avatarModel)
export const InsertAvatarModelSchema = createInsertSchema(schema.avatarModel)

export const CharacterCapabilitySchema = createSelectSchema(schema.characterCapabilities)
export const InsertCharacterCapabilitySchema = createInsertSchema(schema.characterCapabilities)

export const CharacterI18nSchema = createSelectSchema(schema.characterI18n)
export const InsertCharacterI18nSchema = createInsertSchema(schema.characterI18n)

export const CharacterCoverSchema = createSelectSchema(schema.characterCovers)
export const InsertCharacterCoverSchema = createInsertSchema(schema.characterCovers)

export const CharacterPromptSchema = createSelectSchema(schema.characterPrompts)
export const InsertCharacterPromptSchema = createInsertSchema(schema.characterPrompts)

const DateSchema = pipe(
  string(),
  transform(v => new Date(v)),
)

export const CreateCharacterSchema = object({
  avatarModels: optional(array(createInsertSchema(schema.avatarModel, {
    characterId: optional(string()),
    config: AvatarModelConfigSchema,
    type: AvatarModelTypeSchema,
  }))),
  capabilities: optional(array(createInsertSchema(schema.characterCapabilities, {
    characterId: optional(string()),
    config: CharacterCapabilityConfigSchema,
    type: CharacterCapabilityTypeSchema,
  }))),
  // TODO: Replace createInsertSchema-derived request bodies with explicit HTTP DTO schemas.
  // The current shape still leaks persistence fields such as ownerId/creatorId into the API boundary.
  character: createInsertSchema(schema.character, {
    avatarUrl: optional(string()),
    creatorId: optional(string()),
    creatorRole: optional(string()),
    ownerId: optional(string()),
    priceCredit: optional(string()),
  }),
  cover: optional(createInsertSchema(schema.characterCovers, {
    characterId: optional(string()),
  })),
  i18n: optional(array(createInsertSchema(schema.characterI18n, {
    characterId: optional(string()),
    tagline: optional(string()),
  }))),
  prompts: optional(array(createInsertSchema(schema.characterPrompts, {
    characterId: optional(string()),
  }))),
})

// TODO: Split update request schema from DB insert schema.
// This route should reject server-managed fields like id/ownerId/creatorId/timestamps instead of allowing them here.
export const UpdateCharacterSchema = createInsertSchema(schema.character, {
  avatarUrl: optional(string()),
  characterId: optional(string()),
  coverUrl: optional(string()),
  createdAt: optional(DateSchema),
  creatorId: optional(string()),
  creatorRole: optional(string()),
  id: optional(string()),
  ownerId: optional(string()),
  priceCredit: optional(string()),
  updatedAt: optional(DateSchema),
  version: optional(string()),
})
