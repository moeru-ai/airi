import type {
  MemoryConsolidateResultEvent,
  MemoryDeleteResultEvent,
  MemoryIngestChatTurnEvent,
  MemoryIngestChatTurnResultEvent,
  MemorySearchResponseEvent,
  MemoryStatsResponseEvent,
  MetadataEventSource,
} from '@proj-airi/server-sdk'

import assert from 'node:assert/strict'
import process from 'node:process'

import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { buildConsolidationPlan } from './consolidation.js'
import { extractMemoryCandidates } from './heuristics.js'
import { MemoryModuleService } from './service.js'
import { createDefaultMemoryConfig } from './types.js'

interface SmokeEvent {
  type: string
  data?: unknown
  route?: unknown
  metadata?: {
    source?: {
      id?: string
    }
    event?: {
      id?: string
      parentId?: string
    }
  }
}

class FakeClient {
  sent: SmokeEvent[] = []
  private readonly handlers = new Map<string, Array<(event: SmokeEvent) => Promise<void> | void>>()

  onEvent(type: string, handler: (event: SmokeEvent) => Promise<void> | void) {
    const handlers = this.handlers.get(type) || []
    handlers.push(handler)
    this.handlers.set(type, handlers)
  }

  send(event: SmokeEvent) {
    this.sent.push(event)
  }

  async emit(event: SmokeEvent) {
    const handlers = this.handlers.get(event.type) || []
    for (const handler of handlers) {
      await handler(event)
    }
  }
}

function lastSent(events: SmokeEvent[], type: SmokeEvent['type']): SmokeEvent | undefined {
  return [...events].reverse().find(event => event.type === type)
}

const identity: MetadataEventSource = {
  kind: 'plugin',
  id: 'memory-pgvector-smoke',
  plugin: {
    id: 'memory-pgvector',
    version: '0.9.0-alpha.15',
  },
}

const scope = {
  userId: 'smoke-user',
  characterId: 'airi',
  sessionId: 'session-smoke',
  chatId: 'chat-smoke',
  module: 'stage-ui',
  namespace: 'chat',
}

const ingestEvent: MemoryIngestChatTurnEvent = {
  requestId: 'smoke-ingest',
  scope,
  userMessage: 'Remember that I love pour-over coffee, call me Alex, and remind me to finish the memory module this week.',
  assistantMessage: 'I will remember your coffee preference and your goal to finish the memory module this week.',
  explicit: true,
  tags: ['smoke'],
  metadata: {
    source: 'smoke-test',
  },
}

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const storePath = join(process.cwd(), 'node_modules/.cache/memory-pgvector-smoke', `store-${runId}.json`)
const originalStoreFile = process.env.MEMORY_STORE_FILE

async function main() {
  process.env.MEMORY_STORE_FILE = storePath

  const config = createDefaultMemoryConfig()
  const candidates = extractMemoryCandidates(ingestEvent, config)
  assert(candidates.length >= 3, 'expected heuristics to extract multiple memory candidates')

  const consolidationPreview = buildConsolidationPlan(candidates.map((candidate, index) => ({
    id: `preview-${index}`,
    scope: candidate.scope,
    kind: candidate.kind,
    content: candidate.content,
    summary: candidate.summary,
    tags: candidate.tags || [],
    importance: candidate.importance || 5,
    confidence: candidate.confidence || 0.7,
    emotionalIntensity: candidate.emotionalIntensity || 0,
    source: {
      kind: candidate.source?.kind || 'manual',
      actor: candidate.source?.actor,
      module: candidate.source?.module,
    },
    metadata: candidate.metadata,
    embeddingModel: 'smoke',
    embedding: [1, 0, 0],
    createdAt: Date.now() - index * 1000,
    updatedAt: Date.now() - index * 1000,
    lastAccessedAt: Date.now() - index * 1000,
    accessCount: 0,
    archived: false,
  })), {
    requestId: 'smoke-consolidate-preview',
    filters: {
      scope,
      archived: false,
    },
  }, config)

  assert(consolidationPreview.inputs.some(item => item.kind === 'working'), 'expected working memory consolidation output')
  assert(consolidationPreview.inputs.some(item => item.kind === 'reflection'), 'expected reflection memory consolidation output')

  const client = new FakeClient()
  const service = new MemoryModuleService(client as any, identity)

  await service.initialize()
  await service.configure({
    ...config,
    storage: {
      filePath: storePath,
    },
    embeddings: {
      ...config.embeddings,
      strategy: 'local',
    },
  })

  await access(storePath)

  await client.emit({
    type: 'module:authenticated',
    data: {
      authenticated: true,
    },
    metadata: {
      source: {
        id: 'smoke-runner',
      },
      event: {
        id: 'evt-auth',
      },
    },
  })

  assert(lastSent(client.sent, 'module:status'), 'expected module ready status event')
  assert(client.sent.some(event => event.type === 'module:contribute:capability:offer'), 'expected capability offers after authentication')

  await client.emit({
    type: 'memory:ingest:chat-turn',
    data: ingestEvent,
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-ingest-1',
      },
    },
  })

  const ingestResult1 = lastSent(client.sent, 'memory:ingest:chat-turn:result')?.data as MemoryIngestChatTurnResultEvent | undefined
  assert(ingestResult1, 'expected ingest result')
  assert(ingestResult1.created.length >= 3, 'expected initial ingest to create multiple memories')

  await client.emit({
    type: 'memory:ingest:chat-turn',
    data: {
      ...ingestEvent,
      requestId: 'smoke-ingest-repeat',
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-ingest-2',
      },
    },
  })

  const ingestResult2 = lastSent(client.sent, 'memory:ingest:chat-turn:result')?.data as MemoryIngestChatTurnResultEvent | undefined
  assert(ingestResult2, 'expected repeated ingest result')
  assert(ingestResult2.merged.length > 0 || ingestResult2.updated.length > 0, 'expected repeated ingest to merge existing memories')

  await client.emit({
    type: 'memory:search:request',
    data: {
      requestId: 'smoke-search',
      query: 'What does the user like to drink and what should we remind them about?',
      filters: {
        scope,
      },
      emitContext: {
        lane: 'memory',
        title: 'Smoke recall',
        topK: 3,
      },
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-search',
      },
    },
  })

  const searchResponse = lastSent(client.sent, 'memory:search:response')?.data as MemorySearchResponseEvent | undefined
  assert(searchResponse, 'expected search response')
  assert(searchResponse.results.length > 0, 'expected search to recall memories')
  assert(searchResponse.results.some(result => result.item.kind === 'preference' || result.item.kind === 'goal'), 'expected recalled preference or goal')

  const contextUpdate = lastSent(client.sent, 'context:update')
  assert(contextUpdate, 'expected memory search to emit context update')

  await client.emit({
    type: 'memory:consolidate:request',
    data: {
      requestId: 'smoke-consolidate',
      filters: {
        scope,
      },
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-consolidate',
      },
    },
  })

  const consolidateResult = lastSent(client.sent, 'memory:consolidate:result')?.data as MemoryConsolidateResultEvent | undefined
  assert(consolidateResult, 'expected consolidate result')
  assert(
    [...consolidateResult.created, ...consolidateResult.updated, ...consolidateResult.merged]
      .some(item => item.kind === 'working' || item.kind === 'reflection'),
    'expected consolidation to create or update working/reflection memories',
  )

  await client.emit({
    type: 'memory:stats:request',
    data: {
      requestId: 'smoke-stats-before-delete',
      filters: {
        scope,
      },
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-stats-1',
      },
    },
  })

  const statsBeforeDelete = lastSent(client.sent, 'memory:stats:response')?.data as MemoryStatsResponseEvent | undefined
  assert(statsBeforeDelete, 'expected stats response before delete')
  assert(statsBeforeDelete.stats.total >= searchResponse.results.length, 'expected stats total to cover recalled memories')
  assert((statsBeforeDelete.stats.byKind.working || 0) >= 1, 'expected working memory in stats')
  assert((statsBeforeDelete.stats.byKind.reflection || 0) >= 1, 'expected reflection memory in stats')

  const deletedId = searchResponse.results[0]!.item.id

  await client.emit({
    type: 'memory:delete',
    data: {
      requestId: 'smoke-delete',
      ids: [deletedId],
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-delete',
      },
    },
  })

  const deleteResult = lastSent(client.sent, 'memory:delete:result')?.data as MemoryDeleteResultEvent | undefined
  assert(deleteResult, 'expected delete result')
  assert.equal(deleteResult.archived, 1, 'expected soft delete to archive one memory')

  await client.emit({
    type: 'memory:stats:request',
    data: {
      requestId: 'smoke-stats-after-delete',
      filters: {
        scope,
      },
    },
    metadata: {
      source: {
        id: 'smoke-ui',
      },
      event: {
        id: 'evt-stats-2',
      },
    },
  })

  const statsAfterDelete = lastSent(client.sent, 'memory:stats:response')?.data as MemoryStatsResponseEvent | undefined
  assert(statsAfterDelete, 'expected stats response after delete')
  assert(statsAfterDelete.stats.archived >= 1, 'expected archived count after soft delete')

  console.info(JSON.stringify({
    candidates: candidates.map(item => item.kind),
    previewConsolidationKinds: consolidationPreview.inputs.map(item => item.kind),
    createdOnFirstIngest: ingestResult1.created.length,
    mergedOnRepeatIngest: ingestResult2.merged.length,
    searchKinds: searchResponse.results.map(result => result.item.kind),
    statsBeforeDelete: statsBeforeDelete.stats,
    deleteResult,
    statsAfterDelete: statsAfterDelete.stats,
  }, null, 2))
  try {
    await rm(storePath, { force: true })
  }
  finally {
    if (originalStoreFile === undefined) {
      delete process.env.MEMORY_STORE_FILE
    }
    else {
      process.env.MEMORY_STORE_FILE = originalStoreFile
    }
  }
}

void main().catch(async (error) => {
  try {
    await rm(storePath, { force: true })
  }
  finally {
    if (originalStoreFile === undefined) {
      delete process.env.MEMORY_STORE_FILE
    }
    else {
      process.env.MEMORY_STORE_FILE = originalStoreFile
    }
  }

  throw error
})
