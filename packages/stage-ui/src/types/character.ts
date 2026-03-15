import type { InferOutput } from 'valibot'

import { array, date, literal, number, object, optional, pipe, string, transform, union } from 'valibot'

// --- Enums & Configs ---

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

const PromptTypeSchema = union([
  literal('system'),
  literal('personality'),
  literal('greetings'),
])

const DateSchema = pipe(
  union([string(), date()]),
  transform(v => new Date(v)),
)

// --- Base Entities (mimicking database tables) ---

export const CharacterBaseSchema = object({
  id: string(),
  version: string(),
  coverUrl: string(),
  avatarUrl: optional(string()),
  characterAvatarUrl: optional(string()),
  coverBackgroundUrl: optional(string()),
  creatorRole: optional(string()),
  priceCredit: string(),
  likesCount: number(),
  bookmarksCount: number(),
  interactionsCount: number(),
  forksCount: number(),
  creatorId: string(),
  ownerId: string(),
  characterId: string(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
  deletedAt: optional(DateSchema),
})

export const CharacterCapabilitySchema = object({
  id: string(),
  characterId: string(),
  type: CharacterCapabilityTypeSchema,
  config: CharacterCapabilityConfigSchema,
})

export const AvatarModelSchema = object({
  id: string(),
  characterId: string(),
  name: string(),
  type: AvatarModelTypeSchema,
  description: string(),
  config: AvatarModelConfigSchema,
  createdAt: DateSchema,
  updatedAt: DateSchema,
})

export const CharacterI18nSchema = object({
  id: string(),
  characterId: string(),
  language: string(),
  name: string(),
  tagline: optional(string()),
  description: string(),
  tags: array(string()),
  createdAt: DateSchema,
  updatedAt: DateSchema,
})

export const CharacterPromptSchema = object({
  id: string(),
  characterId: string(),
  language: string(),
  type: PromptTypeSchema,
  content: string(),
})

// --- Aggregated Character (with relations) ---

export const CharacterWithRelationsSchema = object({
  ...CharacterBaseSchema.entries,
  capabilities: optional(array(CharacterCapabilitySchema)),
  avatarModels: optional(array(AvatarModelSchema)),
  i18n: optional(array(CharacterI18nSchema)),
  prompts: optional(array(CharacterPromptSchema)),
  likes: optional(array(object({ userId: string(), characterId: string() }))),
  bookmarks: optional(array(object({ userId: string(), characterId: string() }))),
})

// --- API Request Schemas ---

export const CreateCharacterSchema = object({
  character: object({
    id: optional(string()),
    version: string(),
    coverUrl: string(),
    characterId: string(),
    // creatorId & ownerId are handled by server
  }),
  capabilities: optional(array(object({
    type: CharacterCapabilityTypeSchema,
    config: CharacterCapabilityConfigSchema,
  }))),
  avatarModels: optional(array(object({
    name: string(),
    type: AvatarModelTypeSchema,
    description: string(),
    config: AvatarModelConfigSchema,
  }))),
  i18n: optional(array(object({
    language: string(),
    name: string(),
    description: string(),
    tags: array(string()),
  }))),
  prompts: optional(array(object({
    language: string(),
    type: PromptTypeSchema,
    content: string(),
  }))),
})

export const UpdateCharacterSchema = object({
  version: optional(string()),
  coverUrl: optional(string()),
  characterId: optional(string()),
})

// --- Type Exports ---

export type Character = InferOutput<typeof CharacterWithRelationsSchema>
export type CharacterBase = InferOutput<typeof CharacterBaseSchema>
export type CharacterCapability = InferOutput<typeof CharacterCapabilitySchema>
export type AvatarModel = InferOutput<typeof AvatarModelSchema>
export type CharacterI18n = InferOutput<typeof CharacterI18nSchema>
export type CharacterPrompt = InferOutput<typeof CharacterPromptSchema>

export type CreateCharacterPayload = InferOutput<typeof CreateCharacterSchema>
export type UpdateCharacterPayload = InferOutput<typeof UpdateCharacterSchema>
