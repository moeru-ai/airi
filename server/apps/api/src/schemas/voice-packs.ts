import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { boolean, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export interface VoicePackParams {
  pitch?: number
  rate?: number
  volume?: number
}

export const voicePacks = pgTable(
  'voice_packs',
  {
    costMultiplier: real('cost_multiplier').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    description: text('description'),

    enabled: boolean('enabled').notNull().default(true),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    model: text('model').notNull(),
    name: text('name').notNull(),
    params: jsonb('params').notNull().$type<VoicePackParams>().default({}),
    provider: text('provider').notNull(),
    ttsModelId: text('tts_model_id').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    upstreamVoiceId: text('upstream_voice_id').notNull(),
    voiceId: text('voice_id').notNull(),
  },
)

export type NewVoicePack = InferInsertModel<typeof voicePacks>
export type VoicePack = InferSelectModel<typeof voicePacks>
