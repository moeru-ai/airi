import type { InferOutput } from 'valibot'

import type { Database } from '../../../libs/db'
import type { VoicePack } from '../../../schemas/voice-packs'

import { and, eq } from 'drizzle-orm'
import { boolean, maxLength, minValue, nonEmpty, number, object, optional, pipe, string } from 'valibot'

import * as schema from '../../../schemas/voice-packs'

export const VoicePackParamsSchema = object({
  pitch: optional(number()),
  volume: optional(number()),
  rate: optional(pipe(number(), minValue(0.01, 'rate must be positive'))),
})

export const VoicePackCostMultiplierSchema = pipe(
  number(),
  minValue(0, 'costMultiplier must not be negative'),
)

export const CreateVoicePackInputSchema = object({
  name: pipe(string(), nonEmpty('name is required'), maxLength(120)),
  description: optional(pipe(string(), maxLength(500))),
  provider: pipe(string(), nonEmpty('provider is required'), maxLength(100)),
  model: pipe(string(), nonEmpty('model is required'), maxLength(200)),
  voiceId: pipe(string(), nonEmpty('voiceId is required'), maxLength(200)),
  upstreamVoiceId: pipe(string(), nonEmpty('upstreamVoiceId is required'), maxLength(200)),
  ttsModelId: pipe(string(), nonEmpty('ttsModelId is required'), maxLength(200)),
  params: optional(VoicePackParamsSchema, {}),
  costMultiplier: VoicePackCostMultiplierSchema,
  enabled: optional(boolean(), true),
})

export const UpdateVoicePackInputSchema = object({
  name: optional(pipe(string(), nonEmpty('name must not be empty'), maxLength(120))),
  description: optional(pipe(string(), maxLength(500))),
  provider: optional(pipe(string(), nonEmpty('provider must not be empty'), maxLength(100))),
  model: optional(pipe(string(), nonEmpty('model must not be empty'), maxLength(200))),
  voiceId: optional(pipe(string(), nonEmpty('voiceId must not be empty'), maxLength(200))),
  upstreamVoiceId: optional(pipe(string(), nonEmpty('upstreamVoiceId must not be empty'), maxLength(200))),
  ttsModelId: optional(pipe(string(), nonEmpty('ttsModelId must not be empty'), maxLength(200))),
  params: optional(VoicePackParamsSchema),
  costMultiplier: optional(VoicePackCostMultiplierSchema),
  enabled: optional(boolean()),
})

/**
 * Voice Pack creation input accepted by the admin service.
 */
export type CreateVoicePackInput = InferOutput<typeof CreateVoicePackInputSchema>

/**
 * Voice Pack update input accepted by the admin service.
 */
export type UpdateVoicePackInput = InferOutput<typeof UpdateVoicePackInputSchema>

/**
 * Handles the curated server-side Voice Pack library.
 *
 * Use when:
 * - Admin routes create, update, disable, or list curated cloud-provider voices.
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
        name: input.name,
        description: input.description,
        provider: input.provider,
        model: input.model,
        voiceId: input.voiceId,
        upstreamVoiceId: input.upstreamVoiceId,
        ttsModelId: input.ttsModelId,
        params: input.params,
        costMultiplier: input.costMultiplier,
        enabled: input.enabled,
      }).returning()

      return inserted
    },

    async list() {
      return await db.query.voicePacks.findMany({
        orderBy: (voicePacks, { desc }) => [desc(voicePacks.createdAt)],
      })
    },

    async listEnabled() {
      return await db.query.voicePacks.findMany({
        where: eq(schema.voicePacks.enabled, true),
        orderBy: (voicePacks, { desc }) => [desc(voicePacks.createdAt)],
      })
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

    async update(id: string, input: UpdateVoicePackInput): Promise<VoicePack | null> {
      const [updated] = await db.update(schema.voicePacks)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.voicePacks.id, id))
        .returning()

      return updated ?? null
    },

    async disable(id: string): Promise<VoicePack | null> {
      const [updated] = await db.update(schema.voicePacks)
        .set({ enabled: false, updatedAt: new Date() })
        .where(and(
          eq(schema.voicePacks.id, id),
          eq(schema.voicePacks.enabled, true),
        ))
        .returning()

      return updated ?? null
    },
  }
}

export type VoicePackService = ReturnType<typeof createVoicePackService>
