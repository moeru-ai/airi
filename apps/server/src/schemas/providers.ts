import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// type ProviderType = 'llm' | 'tts' | 'vlm'
// type SourceType = 'pre-defined' | 'custom'

// export const provider = pgTable(
//   'provider',
//   {
//     id: text('id').primaryKey(),

//     type: text('type').notNull().$type<ProviderType>(),
//     name: text('name').notNull(),
//     description: text('description').notNull(),

//     source: text('source').notNull().$type<SourceType>(),
//     apiUrl: text('api_url'),
//     apiKey: text('api_key'),

//     createdAt: timestamp('created_at').defaultNow().notNull(),
//     updatedAt: timestamp('updated_at').defaultNow().notNull(),
//   },
// )
