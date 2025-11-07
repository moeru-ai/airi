import type { ConversationHistoryEntry, StructuredMemoryContext, StructuredMemoryFragment } from '../types/memory'

import { nanoid } from 'nanoid'

type PGliteInstance = import('@electric-sql/pglite').PGlite

const DATABASE_NAMESPACE = 'idb://airi-memory'
const MAX_MESSAGES_PER_MODEL = 200
const MAX_COMPLETIONS_PER_MODEL = 200
const MAX_FRAGMENTS_PER_MODEL = 400

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memory_messages (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  content TEXT NOT NULL,
  platform TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_messages_model_created
  ON memory_messages (model_name, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_completions (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  platform TEXT NOT NULL,
  task TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_completions_model_created
  ON memory_completions (model_name, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_fragments (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  category TEXT NOT NULL,
  importance REAL NOT NULL,
  emotional_impact REAL NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_fragments_model_type_created
  ON memory_fragments (model_name, memory_type, created_at DESC);
`

let dbPromise: Promise<PGliteInstance> | null = null
let schemaReady: Promise<void> | null = null

async function getDb(): Promise<PGliteInstance> {
  if (typeof window === 'undefined') {
    throw new TypeError('Local memory is only available in browser environments.')
  }

  if (!dbPromise) {
    dbPromise = import('@electric-sql/pglite').then(async ({ PGlite }) => {
      const db = new PGlite(DATABASE_NAMESPACE)
      return db
    })
  }

  return dbPromise
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await getDb()
      await db.exec(SCHEMA_SQL)
    })()
  }
  await schemaReady
}

async function withDb<T>(fn: (db: PGliteInstance) => Promise<T>): Promise<T> {
  await ensureSchema()
  const db = await getDb()
  return await fn(db)
}

function normalizeModelName(modelName?: string): string {
  return modelName && modelName.trim() ? modelName.trim() : 'default'
}

interface InsertMessageOptions {
  content: string
  platform?: string
  modelName?: string
  role: 'user' | 'assistant'
  createdAt?: number
}

async function insertMessage({
  content,
  platform = 'web',
  modelName,
  role,
  createdAt = Date.now(),
}: InsertMessageOptions): Promise<void> {
  const model = normalizeModelName(modelName)
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO memory_messages (id, model_name, content, platform, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nanoid(), model, content, platform, role, createdAt],
    )
    await trimTable(db, 'memory_messages', model, MAX_MESSAGES_PER_MODEL)
  })
}

interface InsertCompletionOptions {
  prompt: string
  response: string
  platform?: string
  task?: string
  modelName?: string
  createdAt?: number
}

async function insertCompletion({
  prompt,
  response,
  platform = 'web',
  task = '',
  modelName,
  createdAt = Date.now(),
}: InsertCompletionOptions): Promise<void> {
  const model = normalizeModelName(modelName)
  const entryId = nanoid()

  await withDb(async (db) => {
    await db.query(
      `INSERT INTO memory_completions (id, model_name, prompt, response, platform, task, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entryId, model, prompt, response, platform, task, createdAt],
    )
    await trimTable(db, 'memory_completions', model, MAX_COMPLETIONS_PER_MODEL)

    const { memoryType, importance, emotionalImpact } = scoreMemory(response)
    await db.query(
      `INSERT INTO memory_fragments (id, model_name, content, memory_type, category, importance, emotional_impact, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [nanoid(), model, response, memoryType, 'conversation', importance, emotionalImpact, createdAt],
    )
    await trimTable(db, 'memory_fragments', model, MAX_FRAGMENTS_PER_MODEL)
  })
}

function scoreMemory(content: string): { memoryType: 'shortTerm' | 'longTerm', importance: number, emotionalImpact: number } {
  const lengthScore = Math.min(5, Math.max(1, Math.ceil(content.length / 180)))
  const excitedPunctuation = (content.match(/[!?]/g) ?? []).length
  const emotionalImpact = Math.min(5, 1 + Math.floor(excitedPunctuation / 4))
  const keywords = ['important', 'remember', 'promise', 'goal', 'plan']
  const keywordHit = keywords.some(keyword => content.toLowerCase().includes(keyword))

  const importance = Math.min(5, keywordHit ? Math.max(lengthScore, 4) : lengthScore)
  const memoryType = importance >= 4 ? 'longTerm' : 'shortTerm'

  return {
    memoryType,
    importance,
    emotionalImpact,
  }
}

async function trimTable(db: PGliteInstance, table: 'memory_messages' | 'memory_completions' | 'memory_fragments', modelName: string, limit: number) {
  await db.query(
    `DELETE FROM ${table}
     WHERE model_name = $1
       AND id IN (
         SELECT id FROM ${table}
         WHERE model_name = $1
         ORDER BY created_at DESC
         OFFSET $2
       )`,
    [modelName, limit],
  )
}

export async function testLocalMemoryConnection(): Promise<void> {
  await withDb(async db => db.query('SELECT 1'))
}

export async function storeUserMessage(content: string, platform?: string, modelName?: string): Promise<void> {
  await insertMessage({ content, platform, modelName, role: 'user' })
}

export async function storeAIResponse(prompt: string, response: string, platform?: string, task?: string, modelName?: string): Promise<void> {
  await insertCompletion({ prompt, response, platform, task, modelName })
}

async function fetchRecentMessages(modelName: string, limit: number): Promise<Array<{ content: string, created_at: number }>> {
  return await withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT content, created_at
         FROM memory_messages
        WHERE model_name = $1
          AND role = 'user'
        ORDER BY created_at DESC
        LIMIT $2`,
      [modelName, limit],
    )
    return rows as Array<{ content: string, created_at: number }>
  })
}

async function fetchRecentCompletions(modelName: string, limit: number): Promise<Array<{ response: string, task: string, created_at: number }>> {
  return await withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT response, COALESCE(task, '') AS task, created_at
         FROM memory_completions
        WHERE model_name = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [modelName, limit],
    )
    return rows as Array<{ response: string, task: string, created_at: number }>
  })
}

async function fetchFragments(modelName: string, memoryType: 'shortTerm' | 'longTerm', limit: number): Promise<StructuredMemoryFragment[]> {
  return await withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT id, content, memory_type, category, importance, emotional_impact, created_at
         FROM memory_fragments
        WHERE model_name = $1
          AND memory_type = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [modelName, memoryType, limit],
    )
    return rows as StructuredMemoryFragment[]
  })
}

export async function buildQueryContext(message: string, modelName?: string): Promise<string> {
  const model = normalizeModelName(modelName)
  await insertMessage({ content: message, platform: 'web', modelName: model, role: 'user' })

  const [recentMessages, recentCompletions, shortTerm, longTerm] = await Promise.all([
    fetchRecentMessages(model, 10),
    fetchRecentCompletions(model, 10),
    fetchFragments(model, 'shortTerm', 10),
    fetchFragments(model, 'longTerm', 10),
  ])

  const parts: string[] = [
    'IMPORTANT: Use the following context summarizing previous interactions to respond appropriately:',
  ]

  if (recentMessages.length) {
    parts.push('Recent user messages:')
    for (const item of recentMessages) {
      parts.push(`- ${formatTimestamp(item.created_at)}: ${item.content}`)
    }
  }

  if (recentCompletions.length) {
    parts.push('Recent assistant responses:')
    for (const item of recentCompletions) {
      const taskLabel = item.task ? ` (Task: ${item.task})` : ''
      parts.push(`- ${formatTimestamp(item.created_at)}: ${item.response}${taskLabel}`)
    }
  }

  if (shortTerm.length) {
    parts.push('Short-term memories:')
    for (const fragment of shortTerm) {
      parts.push(`- ${formatTimestamp(fragment.created_at)} [${fragment.category}] importance ${fragment.importance}: ${fragment.content}`)
    }
  }

  if (longTerm.length) {
    parts.push('Long-term memories:')
    for (const fragment of longTerm) {
      parts.push(`- ${formatTimestamp(fragment.created_at)} [${fragment.category}] importance ${fragment.importance}: ${fragment.content}`)
    }
  }

  return parts.join('\n')
}

export async function fetchStructuredContext(message: string, modelName?: string): Promise<StructuredMemoryContext> {
  const model = normalizeModelName(modelName)
  await insertMessage({ content: message, platform: 'web', modelName: model, role: 'user' })

  const [recentMessages, recentCompletions, shortTerm, longTerm] = await Promise.all([
    fetchRecentMessages(model, 10),
    fetchRecentCompletions(model, 10),
    fetchFragments(model, 'shortTerm', 12),
    fetchFragments(model, 'longTerm', 12),
  ])

  return {
    workingMemory: {
      recentMessages,
      recentCompletions,
    },
    semanticMemory: {
      shortTerm,
      longTerm,
      consolidatedMemories: [],
      associatedMemories: [],
    },
    structuredKnowledge: {
      entities: [],
    },
    goalContext: {
      longTermGoals: [],
      shortTermIdeas: [],
    },
  }
}

export async function fetchConversationHistory(limit: number, before: number | undefined, modelName?: string): Promise<{ messages: ConversationHistoryEntry[], hasMore: boolean, nextCursor?: number }> {
  const model = normalizeModelName(modelName)
  const cursor = before ?? Date.now()

  const [messages, completions] = await Promise.all([
    withDb(async (db) => {
      const { rows } = await db.query(
        `SELECT id, content, platform, created_at
           FROM memory_messages
          WHERE model_name = $1
            AND role = 'user'
            AND created_at < $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [model, cursor, limit],
      )
      return rows as Array<{ id: string, content: string, platform: string, created_at: number }>
    }),
    withDb(async (db) => {
      const { rows } = await db.query(
        `SELECT id, response AS content, task, created_at
           FROM memory_completions
          WHERE model_name = $1
            AND created_at < $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [model, cursor, limit],
      )
      return rows as Array<{ id: string, content: string, task: string, created_at: number }>
    }),
  ])

  const merged: ConversationHistoryEntry[] = [
    ...messages.map(item => ({
      id: item.id,
      content: item.content,
      platform: item.platform,
      created_at: item.created_at,
      type: 'user' as const,
    })),
    ...completions.map(item => ({
      id: item.id,
      content: item.content,
      task: item.task,
      created_at: item.created_at,
      type: 'assistant' as const,
    })),
  ]

  merged.sort((a, b) => b.created_at - a.created_at)

  const sliced = merged.slice(0, limit)
  sliced.reverse()

  const earliest = sliced[0]?.created_at

  return {
    messages: sliced,
    hasMore: merged.length >= limit,
    nextCursor: earliest,
  }
}

export async function clearMemory(modelName?: string): Promise<void> {
  const model = normalizeModelName(modelName)
  await withDb(async (db) => {
    await db.query('DELETE FROM memory_messages WHERE model_name = $1', [model])
    await db.query('DELETE FROM memory_completions WHERE model_name = $1', [model])
    await db.query('DELETE FROM memory_fragments WHERE model_name = $1', [model])
  })
}

export interface ExportedMemoryPayload {
  version: number
  exportedAt: number
  modelName: string
  messages: Array<{ id: string, content: string, platform: string, created_at: number }>
  completions: Array<{ id: string, prompt: string, response: string, platform: string, task: string, created_at: number }>
  fragments: StructuredMemoryFragment[]
}

export async function exportChatHistory(modelName?: string): Promise<ExportedMemoryPayload> {
  const model = normalizeModelName(modelName)
  return await withDb(async (db) => {
    const [{ rows: messages }, { rows: completions }, { rows: fragments }] = await Promise.all([
      db.query(
        `SELECT id, content, platform, created_at
           FROM memory_messages
          WHERE model_name = $1
          ORDER BY created_at ASC`,
        [model],
      ),
      db.query(
        `SELECT id, prompt, response, platform, COALESCE(task, '') as task, created_at
           FROM memory_completions
          WHERE model_name = $1
          ORDER BY created_at ASC`,
        [model],
      ),
      db.query(
        `SELECT id, content, memory_type, category, importance, emotional_impact, created_at
           FROM memory_fragments
          WHERE model_name = $1
          ORDER BY created_at ASC`,
        [model],
      ),
    ])

    return {
      version: 1,
      exportedAt: Date.now(),
      modelName: model,
      messages: messages as Array<{ id: string, content: string, platform: string, created_at: number }>,
      completions: completions as Array<{ id: string, prompt: string, response: string, platform: string, task: string, created_at: number }>,
      fragments: fragments as StructuredMemoryFragment[],
    }
  })
}

export async function importChatHistory(payload: ExportedMemoryPayload): Promise<void> {
  const model = normalizeModelName(payload?.modelName)
  await withDb(async (db) => {
    await db.query('BEGIN')
    try {
      for (const message of payload.messages) {
        await db.query(
          `INSERT INTO memory_messages (id, model_name, content, platform, role, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE
             SET model_name = EXCLUDED.model_name,
                 content = EXCLUDED.content,
                 platform = EXCLUDED.platform,
                 role = EXCLUDED.role,
                 created_at = EXCLUDED.created_at`,
          [
            message.id,
            model,
            message.content,
            message.platform ?? 'web',
            'user',
            message.created_at,
          ],
        )
      }

      for (const completion of payload.completions) {
        await db.query(
          `INSERT INTO memory_completions (id, model_name, prompt, response, platform, task, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE
             SET model_name = EXCLUDED.model_name,
                 prompt = EXCLUDED.prompt,
                 response = EXCLUDED.response,
                 platform = EXCLUDED.platform,
                 task = EXCLUDED.task,
                 created_at = EXCLUDED.created_at`,
          [
            completion.id,
            model,
            completion.prompt,
            completion.response,
            completion.platform ?? 'web',
            completion.task ?? '',
            completion.created_at,
          ],
        )
      }

      for (const fragment of payload.fragments) {
        await db.query(
          `INSERT INTO memory_fragments (id, model_name, content, memory_type, category, importance, emotional_impact, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE
             SET model_name = EXCLUDED.model_name,
                 content = EXCLUDED.content,
                 memory_type = EXCLUDED.memory_type,
                 category = EXCLUDED.category,
                 importance = EXCLUDED.importance,
                 emotional_impact = EXCLUDED.emotional_impact,
                 created_at = EXCLUDED.created_at`,
          [
            fragment.id,
            model,
            fragment.content,
            fragment.memory_type,
            fragment.category,
            fragment.importance,
            fragment.emotional_impact,
            fragment.created_at,
          ],
        )
      }

      await db.query('COMMIT')
    }
    catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  })
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}
