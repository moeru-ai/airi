import type {
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  MemorySearchFilters,
  MemorySourceDescriptor,
  MemoryStatsSnapshot,
  MemoryUpsertInput,
  ModuleConfigSchema,
} from '@proj-airi/server-sdk'

import process from 'node:process'

export interface MemoryModuleConfig {
  storage: {
    filePath: string
  }
  embeddings: {
    strategy: 'local' | 'provider' | 'hybrid'
    providerBaseUrl?: string
    providerApiKey?: string
    providerModel?: string
    localDimensions: number
  }
  retrieval: {
    defaultLimit: number
    minScore: number
    semanticWeight: number
    lexicalWeight: number
    tagWeight: number
    importanceWeight: number
    recencyWeight: number
    dedupeThreshold: number
  }
  consolidation: {
    enabled: boolean
    maxSourceItems: number
    maxEpisodicPerScope: number
    archiveSourceEpisodic: boolean
    reflectionMinImportance: number
  }
  heuristics: {
    maxContentLength: number
    keepAssistantEpisodic: boolean
  }
}

export interface MemoryStoreState {
  version: 1
  items: MemoryRecord[]
}

export interface EmbeddingOutput {
  vector: number[]
  model: string
}

export interface MemoryOperationBatch {
  created: MemoryRecord[]
  updated: MemoryRecord[]
  merged: MemoryRecord[]
}

export interface MemoryStatsScopeCounts {
  users: Set<string>
  characters: Set<string>
  chats: Set<string>
  sessions: Set<string>
  modules: Set<string>
  namespaces: Set<string>
}

export const DEFAULT_MEMORY_SOURCE: MemorySourceDescriptor = {
  kind: 'manual',
}

export const MEMORY_CONFIG_SCHEMA: ModuleConfigSchema = {
  id: 'airi.config.memory-pgvector',
  version: 1,
  schema: {
    type: 'object',
    properties: {
      storage: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
        },
      },
      embeddings: {
        type: 'object',
        properties: {
          strategy: { type: 'string', enum: ['local', 'provider', 'hybrid'] },
          providerBaseUrl: { type: 'string' },
          providerApiKey: { type: 'string' },
          providerModel: { type: 'string' },
          localDimensions: { type: 'number' },
        },
      },
      retrieval: {
        type: 'object',
        properties: {
          defaultLimit: { type: 'number' },
          minScore: { type: 'number' },
          semanticWeight: { type: 'number' },
          lexicalWeight: { type: 'number' },
          tagWeight: { type: 'number' },
          importanceWeight: { type: 'number' },
          recencyWeight: { type: 'number' },
          dedupeThreshold: { type: 'number' },
        },
      },
      consolidation: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          maxSourceItems: { type: 'number' },
          maxEpisodicPerScope: { type: 'number' },
          archiveSourceEpisodic: { type: 'boolean' },
          reflectionMinImportance: { type: 'number' },
        },
      },
      heuristics: {
        type: 'object',
        properties: {
          maxContentLength: { type: 'number' },
          keepAssistantEpisodic: { type: 'boolean' },
        },
      },
    },
  },
}

export const MEMORY_CAPABILITIES = [
  {
    id: 'memory.upsert',
    name: 'Memory Upsert',
    description: 'Store or merge memory fragments.',
  },
  {
    id: 'memory.search',
    name: 'Memory Search',
    description: 'Recall memory fragments with hybrid search.',
  },
  {
    id: 'memory.ingest.chat-turn',
    name: 'Memory Ingest Chat Turn',
    description: 'Extract memory candidates from a chat turn.',
  },
  {
    id: 'memory.delete',
    name: 'Memory Delete',
    description: 'Archive or delete memory fragments.',
  },
  {
    id: 'memory.stats',
    name: 'Memory Stats',
    description: 'Summarize the current memory store.',
  },
  {
    id: 'memory.consolidate',
    name: 'Memory Consolidation',
    description: 'Create working and reflective memories from recent fragments.',
  },
] as const

export const MEMORY_KIND_TAGS: Record<MemoryKind, string[]> = {
  working: ['working-memory'],
  episodic: ['episode'],
  semantic: ['semantic'],
  preference: ['preference'],
  relationship: ['relationship'],
  goal: ['goal'],
  task: ['task'],
  fact: ['fact'],
  reflection: ['reflection'],
}

export function createEmptyStatsSnapshot(): MemoryStatsSnapshot {
  return {
    total: 0,
    archived: 0,
    byKind: {},
    scopes: {
      users: 0,
      characters: 0,
      chats: 0,
      sessions: 0,
      modules: 0,
      namespaces: 0,
    },
  }
}

export function createStatsScopeCounts(): MemoryStatsScopeCounts {
  return {
    users: new Set(),
    characters: new Set(),
    chats: new Set(),
    sessions: new Set(),
    modules: new Set(),
    namespaces: new Set(),
  }
}

export function toMemoryScopeKey(scope: MemoryScope): string {
  return JSON.stringify({
    userId: scope.userId ?? '',
    characterId: scope.characterId ?? '',
    chatId: scope.chatId ?? '',
    sessionId: scope.sessionId ?? '',
    module: scope.module ?? '',
    namespace: scope.namespace ?? '',
  })
}

export function hasActiveFilters(filters?: MemorySearchFilters): boolean {
  if (!filters) {
    return false
  }

  return Boolean(
    filters.archived !== undefined
    || filters.minImportance !== undefined
    || filters.kinds?.length
    || Object.values(filters.scope || {}).some(Boolean)
    || filters.sourceKinds?.length
    || filters.tags?.length,
  )
}

export function createDefaultMemoryConfig(): MemoryModuleConfig {
  return {
    storage: {
      filePath: process.env.MEMORY_STORE_FILE || 'data/memory-pgvector.json',
    },
    embeddings: {
      strategy: process.env.MEMORY_EMBEDDING_STRATEGY === 'provider'
        ? 'provider'
        : process.env.MEMORY_EMBEDDING_STRATEGY === 'hybrid'
          ? 'hybrid'
          : 'local',
      providerBaseUrl: process.env.EMBEDDING_API_BASE_URL,
      providerApiKey: process.env.EMBEDDING_API_KEY,
      providerModel: process.env.EMBEDDING_MODEL,
      localDimensions: Number.parseInt(process.env.MEMORY_LOCAL_EMBED_DIMENSIONS || '128', 10),
    },
    retrieval: {
      defaultLimit: Number.parseInt(process.env.MEMORY_DEFAULT_LIMIT || '8', 10),
      minScore: Number.parseFloat(process.env.MEMORY_MIN_SCORE || '0.18'),
      semanticWeight: Number.parseFloat(process.env.MEMORY_SEMANTIC_WEIGHT || '0.45'),
      lexicalWeight: Number.parseFloat(process.env.MEMORY_LEXICAL_WEIGHT || '0.25'),
      tagWeight: Number.parseFloat(process.env.MEMORY_TAG_WEIGHT || '0.05'),
      importanceWeight: Number.parseFloat(process.env.MEMORY_IMPORTANCE_WEIGHT || '0.15'),
      recencyWeight: Number.parseFloat(process.env.MEMORY_RECENCY_WEIGHT || '0.10'),
      dedupeThreshold: Number.parseFloat(process.env.MEMORY_DEDUPE_THRESHOLD || '0.92'),
    },
    consolidation: {
      enabled: process.env.MEMORY_CONSOLIDATION_ENABLED !== 'false',
      maxSourceItems: Number.parseInt(process.env.MEMORY_CONSOLIDATION_MAX_SOURCE_ITEMS || '18', 10),
      maxEpisodicPerScope: Number.parseInt(process.env.MEMORY_MAX_EPISODIC_PER_SCOPE || '12', 10),
      archiveSourceEpisodic: process.env.MEMORY_ARCHIVE_SOURCE_EPISODIC !== 'false',
      reflectionMinImportance: Number.parseFloat(process.env.MEMORY_REFLECTION_MIN_IMPORTANCE || '6'),
    },
    heuristics: {
      maxContentLength: Number.parseInt(process.env.MEMORY_MAX_CONTENT_LENGTH || '1200', 10),
      keepAssistantEpisodic: process.env.MEMORY_KEEP_ASSISTANT_EPISODIC === 'true',
    },
  }
}

export function mergeMemoryConfig(base: MemoryModuleConfig, patch?: Partial<MemoryModuleConfig> | Record<string, unknown>): MemoryModuleConfig {
  if (!patch) {
    return base
  }

  const typedPatch = patch as Partial<MemoryModuleConfig>

  return {
    storage: {
      ...base.storage,
      ...typedPatch.storage,
    },
    embeddings: {
      ...base.embeddings,
      ...typedPatch.embeddings,
    },
    retrieval: {
      ...base.retrieval,
      ...typedPatch.retrieval,
    },
    consolidation: {
      ...base.consolidation,
      ...typedPatch.consolidation,
    },
    heuristics: {
      ...base.heuristics,
      ...typedPatch.heuristics,
    },
  }
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, value))
}

export function clampScale(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min
  }

  return Math.max(min, Math.min(max, value))
}

export function normalizeUpsertInput(input: MemoryUpsertInput, config: MemoryModuleConfig): MemoryUpsertInput {
  return {
    ...input,
    content: input.content.trim().slice(0, config.heuristics.maxContentLength),
    summary: input.summary?.trim().slice(0, 280) || undefined,
    tags: Array.from(new Set(input.tags?.map(tag => tag.trim().toLowerCase()).filter(Boolean) || [])),
    importance: clampScale(input.importance ?? 5, 1, 10),
    confidence: clamp01(input.confidence ?? 0.7),
    emotionalIntensity: clampScale(input.emotionalIntensity ?? 0, -10, 10),
    source: {
      ...DEFAULT_MEMORY_SOURCE,
      ...input.source,
    },
  }
}
