import type { InferOutput } from 'valibot'

import type { Database } from '../../../libs/db'
import type { VoicePack } from '../../../schemas/voice-packs'

import { and, eq } from 'drizzle-orm'
import { boolean, maxLength, minValue, nonEmpty, number, object, optional, pipe, string } from 'valibot'

import * as schema from '../../../schemas/voice-packs'

export const VoicePackParamsSchema = object({
  pitch: optional(number()),
  rate: optional(pipe(number(), minValue(0.01, 'rate must be positive'))),
  volume: optional(number()),
})

export const VoicePackCostMultiplierSchema = pipe(
  number(),
  minValue(0, 'costMultiplier must not be negative'),
)

export const CreateVoicePackInputSchema = object({
  costMultiplier: VoicePackCostMultiplierSchema,
  description: optional(pipe(string(), maxLength(500))),
  enabled: optional(boolean(), true),
  model: pipe(string(), nonEmpty('model is required'), maxLength(200)),
  name: pipe(string(), nonEmpty('name is required'), maxLength(120)),
  params: optional(VoicePackParamsSchema, {}),
  provider: pipe(string(), nonEmpty('provider is required'), maxLength(100)),
  ttsModelId: pipe(string(), nonEmpty('ttsModelId is required'), maxLength(200)),
  upstreamVoiceId: pipe(string(), nonEmpty('upstreamVoiceId is required'), maxLength(200)),
  voiceId: pipe(string(), nonEmpty('voiceId is required'), maxLength(200)),
})

export const UpdateVoicePackInputSchema = object({
  costMultiplier: optional(VoicePackCostMultiplierSchema),
  description: optional(pipe(string(), maxLength(500))),
  enabled: optional(boolean()),
  model: optional(pipe(string(), nonEmpty('model must not be empty'), maxLength(200))),
  name: optional(pipe(string(), nonEmpty('name must not be empty'), maxLength(120))),
  params: optional(VoicePackParamsSchema),
  provider: optional(pipe(string(), nonEmpty('provider must not be empty'), maxLength(100))),
  ttsModelId: optional(pipe(string(), nonEmpty('ttsModelId must not be empty'), maxLength(200))),
  upstreamVoiceId: optional(pipe(string(), nonEmpty('upstreamVoiceId must not be empty'), maxLength(200))),
  voiceId: optional(pipe(string(), nonEmpty('voiceId must not be empty'), maxLength(200))),
})

/**
 * Voice Pack creation input accepted by catalog management callers.
 */
export type CreateVoicePackInput = InferOutput<typeof CreateVoicePackInputSchema>

/**
 * Voice Pack update input accepted by catalog management callers.
 */
export type UpdateVoicePackInput = InferOutput<typeof UpdateVoicePackInputSchema>

export type VoicePackService = ReturnType<typeof createVoicePackService>

/**
 * Handles the curated server-side Voice Pack library.
 *
 * Use when:
 * - Catalog management callers create, update, disable, or list curated voices.
 * - Client routes need the enabled-only market list for binding.
 *
 * Expects:
 * - HTTP routes validate input with the exported Valibot schemas before calling.
 *
 * Returns:
 * - CRUD methods that preserve rows and use `enabled=false` as soft disable.
 */
export function createVoicePackService(db: Database) {
  return {
    async create(input: CreateVoicePackInput) {
      const [inserted] = await db.insert(schema.voicePacks).values({
        costMultiplier: input.costMultiplier,
        description: input.description,
        enabled: input.enabled,
        model: input.model,
        name: input.name,
        params: input.params,
        provider: input.provider,
        ttsModelId: input.ttsModelId,
        upstreamVoiceId: input.upstreamVoiceId,
        voiceId: input.voiceId,
      }).returning()

      return inserted
    },

    async disable(id: string): Promise<null | VoicePack> {
      const [updated] = await db.update(schema.voicePacks)
        .set({ enabled: false, updatedAt: new Date() })
        .where(and(
          eq(schema.voicePacks.id, id),
          eq(schema.voicePacks.enabled, true),
        ))
        .returning()

      return updated ?? null
    },

    async findById(id: string) {
      return await db.query.voicePacks.findFirst({
        where: eq(schema.voicePacks.id, id),
      })
    },

    async findEnabledByVoiceId(voiceId: string) {
      return await db.query.voicePacks.findFirst({
        where: and(
          eq(schema.voicePacks.voiceId, voiceId),
          eq(schema.voicePacks.enabled, true),
        ),
      })
    },

    async list() {
      return await db.query.voicePacks.findMany({
        orderBy: (voicePacks, { desc }) => [desc(voicePacks.createdAt)],
      })
    },

    async listEnabled() {
      return await db.query.voicePacks.findMany({
        orderBy: (voicePacks, { desc }) => [desc(voicePacks.createdAt)],
        where: eq(schema.voicePacks.enabled, true),
      })
    },

    async update(id: string, input: UpdateVoicePackInput): Promise<null | VoicePack> {
      const [updated] = await db.update(schema.voicePacks)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.voicePacks.id, id))
        .returning()

      return updated ?? null
    },
  }
}
