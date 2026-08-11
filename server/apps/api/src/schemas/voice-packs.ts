import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { boolean, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export interface VoicePackParams {
  pitch?: number
  volume?: number
  rate?: number
}

export const voicePacks = pgTable(
  'voice_packs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    description: text('description'),

    provider: text('provider').notNull(),
    model: text('model').notNull(),
    voiceId: text('voice_id').notNull(),
    upstreamVoiceId: text('upstream_voice_id').notNull(),
    ttsModelId: text('tts_model_id').notNull(),
    params: jsonb('params').notNull().$type<VoicePackParams>().default({}),
    costMultiplier: real('cost_multiplier').notNull().default(1),
    enabled: boolean('enabled').notNull().default(true),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type VoicePack = InferSelectModel<typeof voicePacks>
export type NewVoicePack = InferInsertModel<typeof voicePacks>
