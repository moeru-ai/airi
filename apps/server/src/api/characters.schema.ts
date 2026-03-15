import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { array, literal, number, object, optional, pipe, string, transform, union } from 'valibot'

import * as schema from '../schemas/characters'

export const AvatarModelConfigSchema = object({
  vrm: optional(object({
    urls: array(string()),
  })),
  live2d: optional(object({
    urls: array(string()),
  })),
})

export const CharacterCapabilityConfigSchema = object({
  apiKey: string(),
  apiBaseUrl: string(),
  llm: optional(object({
    temperature: number(),
    model: string(),
  })),
  tts: optional(object({
    ssml: string(),
    voiceId: string(),
    speed: number(),
    pitch: number(),
  })),
  vlm: optional(object({
    image: string(),
  })),
  asr: optional(object({
    audio: string(),
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
  character: createInsertSchema(schema.character, {
    creatorId: optional(string()),
    ownerId: optional(string()),
    avatarUrl: optional(string()),
    creatorRole: optional(string()),
    priceCredit: optional(string()),
  }),
  cover: optional(createInsertSchema(schema.characterCovers, {
    characterId: optional(string()),
  })),
  capabilities: optional(array(createInsertSchema(schema.characterCapabilities, {
    characterId: optional(string()),
    type: CharacterCapabilityTypeSchema,
    config: CharacterCapabilityConfigSchema,
  }))),
  avatarModels: optional(array(createInsertSchema(schema.avatarModel, {
    characterId: optional(string()),
    type: AvatarModelTypeSchema,
    config: AvatarModelConfigSchema,
  }))),
  i18n: optional(array(createInsertSchema(schema.characterI18n, {
    characterId: optional(string()),
    tagline: optional(string()),
  }))),
  prompts: optional(array(createInsertSchema(schema.characterPrompts, {
    characterId: optional(string()),
  }))),
})

export const UpdateCharacterSchema = createInsertSchema(schema.character, {
  id: optional(string()),
  version: optional(string()),
  coverUrl: optional(string()),
  avatarUrl: optional(string()),
  creatorRole: optional(string()),
  priceCredit: optional(string()),
  creatorId: optional(string()),
  ownerId: optional(string()),
  characterId: optional(string()),
  createdAt: optional(DateSchema),
  updatedAt: optional(DateSchema),
})
