import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { array, number, object, optional, string } from 'valibot'

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

export const CharacterSchema = createSelectSchema(schema.character)
export const InsertCharacterSchema = createInsertSchema(schema.character)

export const AvatarModelSchema = createSelectSchema(schema.avatarModel)
export const InsertAvatarModelSchema = createInsertSchema(schema.avatarModel)

export const CharacterCapabilitySchema = createSelectSchema(schema.characterCapabilities)
export const InsertCharacterCapabilitySchema = createInsertSchema(schema.characterCapabilities)

export const CharacterI18nSchema = createSelectSchema(schema.characterI18n)
export const InsertCharacterI18nSchema = createInsertSchema(schema.characterI18n)

export const CharacterPromptSchema = createSelectSchema(schema.characterPrompts)
export const InsertCharacterPromptSchema = createInsertSchema(schema.characterPrompts)

export const CreateCharacterSchema = object({
  character: createInsertSchema(schema.character, {
    creatorId: optional(string()),
    ownerId: optional(string()),
  }),
  capabilities: optional(array(createInsertSchema(schema.characterCapabilities, {
    characterId: optional(string()),
    config: CharacterCapabilityConfigSchema,
  }))),
  avatarModels: optional(array(createInsertSchema(schema.avatarModel, {
    characterId: optional(string()),
    config: AvatarModelConfigSchema,
  }))),
  i18n: optional(array(createInsertSchema(schema.characterI18n, {
    characterId: optional(string()),
  }))),
  prompts: optional(array(createInsertSchema(schema.characterPrompts, {
    characterId: optional(string()),
  }))),
})

export const UpdateCharacterSchema = createInsertSchema(schema.character, {
  id: optional(string()),
  version: optional(string()),
  coverUrl: optional(string()),
  creatorId: optional(string()),
  ownerId: optional(string()),
  characterId: optional(string()),
  createdAt: optional(string()),
  updatedAt: optional(string()),
})
