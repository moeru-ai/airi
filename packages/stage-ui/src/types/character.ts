import type { InferOutput } from 'valibot'

import { array, date, literal, number, object, optional, pipe, string, transform, union } from 'valibot'

// --- Enums & Configs ---

export const AvatarModelConfigSchema = object({
  live2d: optional(object({
    urls: array(string()),
  })),
  spine: optional(object({
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
  literal('spine'),
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
  avatarUrl: optional(string()),
  bookmarksCount: number(),
  characterAvatarUrl: optional(string()),
  characterId: string(),
  coverBackgroundUrl: optional(string()),
  coverUrl: string(),
  createdAt: DateSchema,
  creatorId: string(),
  creatorRole: optional(string()),
  deletedAt: optional(DateSchema),
  forksCount: number(),
  id: string(),
  interactionsCount: number(),
  likesCount: number(),
  ownerId: string(),
  priceCredit: string(),
  updatedAt: DateSchema,
  version: string(),
})

export const CharacterCapabilitySchema = object({
  characterId: string(),
  config: CharacterCapabilityConfigSchema,
  id: string(),
  type: CharacterCapabilityTypeSchema,
})

export const AvatarModelSchema = object({
  characterId: string(),
  config: AvatarModelConfigSchema,
  createdAt: DateSchema,
  description: string(),
  id: string(),
  name: string(),
  type: AvatarModelTypeSchema,
  updatedAt: DateSchema,
})

export const CharacterI18nSchema = object({
  characterId: string(),
  createdAt: DateSchema,
  description: string(),
  id: string(),
  language: string(),
  name: string(),
  tagline: optional(string()),
  tags: array(string()),
  updatedAt: DateSchema,
})

export const CharacterPromptSchema = object({
  characterId: string(),
  content: string(),
  id: string(),
  language: string(),
  type: PromptTypeSchema,
})

// --- Aggregated Character (with relations) ---

export const CharacterWithRelationsSchema = object({
  ...CharacterBaseSchema.entries,
  avatarModels: optional(array(AvatarModelSchema)),
  bookmarks: optional(array(object({ characterId: string(), userId: string() }))),
  capabilities: optional(array(CharacterCapabilitySchema)),
  i18n: optional(array(CharacterI18nSchema)),
  likes: optional(array(object({ characterId: string(), userId: string() }))),
  prompts: optional(array(CharacterPromptSchema)),
})

// --- API Request Schemas ---

export const CreateCharacterSchema = object({
  avatarModels: optional(array(object({
    config: AvatarModelConfigSchema,
    description: string(),
    name: string(),
    type: AvatarModelTypeSchema,
  }))),
  capabilities: optional(array(object({
    config: CharacterCapabilityConfigSchema,
    type: CharacterCapabilityTypeSchema,
  }))),
  character: object({
    characterId: string(),
    coverUrl: string(),
    id: optional(string()),
    version: string(),
    // creatorId & ownerId are handled by server
  }),
  i18n: optional(array(object({
    description: string(),
    language: string(),
    name: string(),
    tags: array(string()),
  }))),
  prompts: optional(array(object({
    content: string(),
    language: string(),
    type: PromptTypeSchema,
  }))),
})

export const UpdateCharacterSchema = object({
  characterId: optional(string()),
  coverUrl: optional(string()),
  version: optional(string()),
})

// --- Type Exports ---

export type AvatarModel = InferOutput<typeof AvatarModelSchema>
export type Character = InferOutput<typeof CharacterWithRelationsSchema>
export type CharacterBase = InferOutput<typeof CharacterBaseSchema>
export type CharacterCapability = InferOutput<typeof CharacterCapabilitySchema>
export type CharacterI18n = InferOutput<typeof CharacterI18nSchema>
export type CharacterPrompt = InferOutput<typeof CharacterPromptSchema>

export type CreateCharacterPayload = InferOutput<typeof CreateCharacterSchema>
export type UpdateCharacterPayload = InferOutput<typeof UpdateCharacterSchema>
