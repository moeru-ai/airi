import type {
  MemoryModuleConfig,
  MemoryOperationBatch,
} from './types.js'

import { nanoid } from 'nanoid'

import * as ServerSdk from '@proj-airi/server-sdk'

import { buildConsolidationPlan } from './consolidation.js'
import { embedText } from './embeddings.js'
import { extractMemoryCandidates } from './heuristics.js'
import { matchesFilters, scoreMemory } from './scoring.js'
import { MemoryFileStore } from './storage.js'
import { fingerprintText, summarizeText, uniqueStrings } from './text.js'
import { createDefaultMemoryConfig, createEmptyStatsSnapshot, createStatsScopeCounts, hasActiveFilters, MEMORY_CAPABILITIES, MEMORY_CONFIG_SCHEMA, mergeMemoryConfig, normalizeUpsertInput, toMemoryScopeKey } from './types.js'

type ReplyEventType
  = | 'memory:upsert:result'
    | 'memory:search:response'
    | 'memory:delete:result'
    | 'memory:ingest:chat-turn:result'
    | 'memory:stats:response'
    | 'memory:consolidate:result'

export class MemoryModuleService {
  private config: MemoryModuleConfig = createDefaultMemoryConfig()
  private readonly store = new MemoryFileStore(this.config.storage.filePath)
  private readyPromise: Promise<void> | null = null
  private configRevision = 0

  constructor(
    private readonly client: ServerSdk.Client<MemoryModuleConfig>,
    private readonly identity: ServerSdk.MetadataEventSource,
  ) {}

  async initialize() {
    this.bindHandlers()
    this.readyPromise = this.boot()
    await this.readyPromise
  }

  private bindHandlers() {
    this.client.onEvent('module:authenticated', async (event) => {
      if (!event.data.authenticated) {
        return
      }

      await this.ensureReady()
      this.emitReadySignals()
    })

    this.client.onEvent('module:configure', async (event) => {
      await this.configure(event.data.config as Partial<MemoryModuleConfig>)
    })

    this.client.onEvent('memory:upsert', async (event) => {
      const result = await this.handleUpsert(event.data)
      this.reply(event, 'memory:upsert:result', result)
    })

    this.client.onEvent('memory:search:request', async (event) => {
      const result = await this.handleSearch(event)
      this.reply(event, 'memory:search:response', result)
    })

    this.client.onEvent('memory:delete', async (event) => {
      const result = await this.handleDelete(event.data)
      this.reply(event, 'memory:delete:result', result)
    })

    this.client.onEvent('memory:ingest:chat-turn', async (event) => {
      const result = await this.handleIngestChatTurn(event.data)
      this.reply(event, 'memory:ingest:chat-turn:result', result)
    })

    this.client.onEvent('memory:stats:request', async (event) => {
      const result = await this.handleStats(event.data)
      this.reply(event, 'memory:stats:response', result)
    })

    this.client.onEvent('memory:consolidate:request', async (event) => {
      const result = await this.handleConsolidate(event.data)
      this.reply(event, 'memory:consolidate:result', result)
    })
  }

  private async boot() {
    await this.store.load()
  }

  private async ensureReady() {
    await this.readyPromise
  }

  private replyRoute(sourceEvent: ServerSdk.WebSocketBaseEvent<string, unknown>) {
    const destination = sourceEvent.metadata?.source?.id
    if (!destination) {
      return undefined
    }

    return {
      destinations: [destination],
    }
  }

  private reply(
    sourceEvent: ServerSdk.WebSocketBaseEvent<string, unknown>,
    type: ReplyEventType,
    data:
      | ServerSdk.MemoryUpsertResultEvent
      | ServerSdk.MemorySearchResponseEvent
      | ServerSdk.MemoryDeleteResultEvent
      | ServerSdk.MemoryIngestChatTurnResultEvent
      | ServerSdk.MemoryStatsResponseEvent
      | ServerSdk.MemoryConsolidateResultEvent,
  ) {
    this.client.send({
      type,
      route: this.replyRoute(sourceEvent),
      data,
      metadata: {
        event: {
          parentId: sourceEvent.metadata?.event?.id,
        },
      },
    } as any)
  }

  private emitReadySignals() {
    this.client.send({
      type: 'module:status',
      data: {
        identity: this.identity,
        phase: 'ready',
        details: {
          storePath: this.config.storage.filePath,
          items: this.store.getAll().length,
        },
      },
    })

    for (const capability of MEMORY_CAPABILITIES) {
      this.client.send({
        type: 'module:contribute:capability:offer',
        data: {
          identity: this.identity,
          capability: {
            ...(capability satisfies ServerSdk.ModuleCapability),
            metadata: {
              configSchema: MEMORY_CONFIG_SCHEMA,
            },
          },
        },
      })
    }
  }

  async configure(patch?: Partial<MemoryModuleConfig>) {
    this.config = mergeMemoryConfig(this.config, patch)
    this.configRevision += 1

    await this.store.reconfigure(this.config.storage.filePath)

    this.client.send({
      type: 'module:configuration:configured',
      data: {
        identity: this.identity,
        config: {
          configId: MEMORY_CONFIG_SCHEMA.id,
          revision: this.configRevision,
          schemaVersion: MEMORY_CONFIG_SCHEMA.version,
          full: this.config,
        },
      },
    })

    this.emitReadySignals()
  }

  private async createRecordFromInput(input: ServerSdk.MemoryUpsertEvent['items'][number]): Promise<ServerSdk.MemoryRecord> {
    const normalized = normalizeUpsertInput(input, this.config)
    const embedding = await embedText(`${normalized.summary || ''}\n${normalized.content}`.trim(), this.config)
    const now = Date.now()

    return {
      id: normalized.id || nanoid(),
      scope: normalized.scope,
      kind: normalized.kind,
      content: normalized.content,
      summary: normalized.summary || summarizeText(normalized.content),
      tags: uniqueStrings([...(normalized.tags || [])]),
      importance: normalized.importance || 5,
      confidence: normalized.confidence || 0.7,
      emotionalIntensity: normalized.emotionalIntensity || 0,
      source: normalized.source!,
      metadata: normalized.metadata,
      embeddingModel: embedding.model,
      embedding: embedding.vector,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      archived: normalized.archived,
    }
  }

  private mergeIntoRecord(current: ServerSdk.MemoryRecord, next: ServerSdk.MemoryRecord): ServerSdk.MemoryRecord {
    return {
      ...current,
      scope: next.scope,
      content: next.content.length >= current.content.length ? next.content : current.content,
      summary: next.summary || current.summary,
      tags: uniqueStrings([...current.tags, ...next.tags]),
      importance: Math.max(current.importance, next.importance),
      confidence: Math.max(current.confidence, next.confidence),
      emotionalIntensity: Math.abs(next.emotionalIntensity) >= Math.abs(current.emotionalIntensity)
        ? next.emotionalIntensity
        : current.emotionalIntensity,
      source: next.source,
      metadata: {
        ...current.metadata,
        ...next.metadata,
      },
      embeddingModel: next.embeddingModel,
      embedding: next.embedding,
      updatedAt: Date.now(),
      archived: next.archived ?? current.archived,
    }
  }

  private findMergeTarget(record: ServerSdk.MemoryRecord, items: ServerSdk.MemoryRecord[]): ServerSdk.MemoryRecord | undefined {
    const sameScopeAndKind = items.filter(item =>
      !item.archived
      && item.kind === record.kind
      && toMemoryScopeKey(item.scope) === toMemoryScopeKey(record.scope),
    )

    const exactFingerprint = fingerprintText(record.content)
    const exact = sameScopeAndKind.find(item => fingerprintText(item.content) === exactFingerprint)
    if (exact) {
      return exact
    }

    const scored = sameScopeAndKind
      .map(item => scoreMemory(item, {
        requestId: nanoid(),
        query: record.content,
        strategy: 'hybrid',
        filters: {
          scope: record.scope,
          kinds: [record.kind],
        },
      }, this.config, record.embedding))
      .sort((left, right) => right.score - left.score)

    const best = scored[0]
    if (best && best.score >= this.config.retrieval.dedupeThreshold) {
      return best.item
    }

    return undefined
  }

  async handleUpsert(event: ServerSdk.MemoryUpsertEvent): Promise<ServerSdk.MemoryUpsertResultEvent> {
    await this.ensureReady()

    const items = [...this.store.getAll()]
    const batch: MemoryOperationBatch = {
      created: [],
      updated: [],
      merged: [],
    }

    for (const input of event.items) {
      if (!input.content?.trim()) {
        continue
      }

      const record = await this.createRecordFromInput(input)
      const byIdIndex = input.id ? items.findIndex(item => item.id === input.id) : -1

      if (byIdIndex >= 0) {
        const updated = this.mergeIntoRecord(items[byIdIndex]!, record)
        items[byIdIndex] = updated
        batch.updated.push(updated)
        continue
      }

      const mergeTarget = this.findMergeTarget(record, items)
      if (mergeTarget) {
        const mergeIndex = items.findIndex(item => item.id === mergeTarget.id)
        const merged = this.mergeIntoRecord(mergeTarget, record)
        items[mergeIndex] = merged
        batch.merged.push(merged)
        continue
      }

      items.push(record)
      batch.created.push(record)
    }

    await this.store.replaceAll(items)

    return {
      requestId: event.requestId,
      ...batch,
    }
  }

  async handleSearch(event: ServerSdk.WebSocketBaseEvent<'memory:search:request', ServerSdk.MemorySearchRequestEvent>): Promise<ServerSdk.MemorySearchResponseEvent> {
    await this.ensureReady()

    const startedAt = Date.now()
    const minScore = event.data.minScore ?? this.config.retrieval.minScore
    const limit = event.data.limit ?? this.config.retrieval.defaultLimit
    const offset = event.data.offset ?? 0
    const searchFilters = {
      ...event.data.filters,
      archived: event.data.filters?.archived ?? false,
    }
    const activeItems = this.store
      .getAll()
      .filter(item => matchesFilters(item, searchFilters))

    const queryEmbedding = event.data.query
      ? (await embedText(event.data.query, this.config)).vector
      : undefined

    const scored = activeItems
      .map(item => scoreMemory(item, event.data, this.config, queryEmbedding))
      .filter(result => result.score >= minScore)
      .sort((left, right) => right.score - left.score)

    const paged = scored.slice(offset, offset + limit).map((result) => {
      const item = event.data.includeEmbedding
        ? result.item
        : {
            ...result.item,
            embedding: undefined,
          }

      return {
        ...result,
        item,
      }
    })

    if (paged.length > 0) {
      const accessed = new Set(paged.map(result => result.item.id))
      const nextItems = this.store.getAll().map((item) => {
        if (!accessed.has(item.id)) {
          return item
        }

        return {
          ...item,
          accessCount: item.accessCount + 1,
          lastAccessedAt: Date.now(),
        }
      })

      await this.store.replaceAll(nextItems)
    }

    if (event.data.emitContext && paged.length > 0) {
      const destinations = event.data.emitContext.destinations
        || (event.metadata?.source?.id ? [event.metadata.source.id] : undefined)

      this.client.send({
        type: 'context:update',
        route: destinations ? { destinations } : undefined,
        data: {
          id: nanoid(),
          contextId: `memory-recall:${event.data.requestId}`,
          lane: event.data.emitContext.lane || 'memory',
          strategy: event.data.emitContext.strategy || ServerSdk.ContextUpdateStrategy.ReplaceSelf,
          text: [
            event.data.emitContext.title || `Memory recall for "${event.data.query}"`,
            ...paged
              .slice(0, event.data.emitContext.topK || paged.length)
              .filter(result => result.score >= (event.data.emitContext?.minScore ?? minScore))
              .map((result, index) => `${index + 1}. [${result.item.kind}] ${result.item.summary || summarizeText(result.item.content, 200)}`),
          ].join('\n'),
          ideas: paged.slice(0, 3).map(result => result.item.summary || summarizeText(result.item.content, 120)),
          hints: uniqueStrings(paged.flatMap(result => result.item.tags).slice(0, 8)),
          destinations,
          metadata: {
            requestId: event.data.requestId,
            query: event.data.query,
            results: paged.map(result => ({
              id: result.item.id,
              score: result.score,
              kind: result.item.kind,
              summary: result.item.summary,
            })),
          },
        },
        metadata: {
          event: {
            parentId: event.metadata?.event?.id,
          },
        },
      })
    }

    return {
      requestId: event.data.requestId,
      query: event.data.query,
      results: paged,
      total: scored.length,
      tookMs: Date.now() - startedAt,
    }
  }

  async handleDelete(event: ServerSdk.MemoryDeleteEvent): Promise<ServerSdk.MemoryDeleteResultEvent> {
    await this.ensureReady()

    const hasIds = Boolean(event.ids?.length)
    const hasFilters = hasActiveFilters(event.filters)

    if (!hasIds && !hasFilters) {
      return {
        requestId: event.requestId,
        deleted: 0,
        archived: 0,
        ids: [],
      }
    }

    const nextItems: ServerSdk.MemoryRecord[] = []
    const affectedIds: string[] = []
    let deleted = 0
    let archived = 0

    for (const item of this.store.getAll()) {
      const matchesId = event.ids?.includes(item.id) ?? false
      const matchesFilter = hasFilters ? matchesFilters(item, event.filters) : false
      const shouldAffect = matchesId || matchesFilter

      if (!shouldAffect) {
        nextItems.push(item)
        continue
      }

      affectedIds.push(item.id)

      if (event.hardDelete) {
        deleted += 1
        continue
      }

      archived += 1
      nextItems.push({
        ...item,
        archived: true,
        updatedAt: Date.now(),
      })
    }

    await this.store.replaceAll(nextItems)

    return {
      requestId: event.requestId,
      deleted,
      archived,
      ids: affectedIds,
    }
  }

  async handleIngestChatTurn(event: ServerSdk.MemoryIngestChatTurnEvent): Promise<ServerSdk.MemoryIngestChatTurnResultEvent> {
    const candidates = extractMemoryCandidates(event, this.config)
    if (candidates.length === 0) {
      return {
        requestId: event.requestId,
        created: [],
        updated: [],
        merged: [],
      }
    }

    return await this.handleUpsert({
      requestId: event.requestId,
      items: candidates,
    })
  }

  async handleStats(event: ServerSdk.MemoryStatsRequestEvent): Promise<ServerSdk.MemoryStatsResponseEvent> {
    await this.ensureReady()

    const snapshot = createEmptyStatsSnapshot()
    const scopeCounts = createStatsScopeCounts()
    const items = this.store.getAll().filter(item => matchesFilters(item, event.filters))

    snapshot.total = items.length

    for (const item of items) {
      if (item.archived) {
        snapshot.archived += 1
      }

      snapshot.byKind[item.kind] = (snapshot.byKind[item.kind] || 0) + 1

      if (item.scope.userId) {
        scopeCounts.users.add(item.scope.userId)
      }
      if (item.scope.characterId) {
        scopeCounts.characters.add(item.scope.characterId)
      }
      if (item.scope.chatId) {
        scopeCounts.chats.add(item.scope.chatId)
      }
      if (item.scope.sessionId) {
        scopeCounts.sessions.add(item.scope.sessionId)
      }
      if (item.scope.module) {
        scopeCounts.modules.add(item.scope.module)
      }
      if (item.scope.namespace) {
        scopeCounts.namespaces.add(item.scope.namespace)
      }
    }

    snapshot.scopes = {
      users: scopeCounts.users.size,
      characters: scopeCounts.characters.size,
      chats: scopeCounts.chats.size,
      sessions: scopeCounts.sessions.size,
      modules: scopeCounts.modules.size,
      namespaces: scopeCounts.namespaces.size,
    }

    return {
      requestId: event.requestId,
      stats: snapshot,
    }
  }

  async handleConsolidate(event: ServerSdk.MemoryConsolidateRequestEvent): Promise<ServerSdk.MemoryConsolidateResultEvent> {
    await this.ensureReady()

    const plan = buildConsolidationPlan(this.store.getAll(), event, this.config)
    if (plan.inputs.length === 0) {
      return {
        requestId: event.requestId,
        analyzed: plan.analyzed,
        touchedScopes: plan.touchedScopes,
        created: [],
        updated: [],
        merged: [],
        archivedIds: [],
        summaries: plan.summaries,
      }
    }

    const upsertResult = event.dryRun
      ? {
          created: [] as ServerSdk.MemoryRecord[],
          updated: [] as ServerSdk.MemoryRecord[],
          merged: [] as ServerSdk.MemoryRecord[],
        }
      : await this.handleUpsert({
          requestId: event.requestId,
          items: plan.inputs,
        })

    if (!event.dryRun && plan.archivedIds.length > 0) {
      const archivedIds = new Set(plan.archivedIds)
      const nextItems = this.store.getAll().map((item) => {
        if (!archivedIds.has(item.id)) {
          return item
        }

        return {
          ...item,
          archived: true,
          updatedAt: Date.now(),
        }
      })

      await this.store.replaceAll(nextItems)
    }

    return {
      requestId: event.requestId,
      analyzed: plan.analyzed,
      touchedScopes: plan.touchedScopes,
      created: upsertResult.created,
      updated: upsertResult.updated,
      merged: upsertResult.merged,
      archivedIds: event.dryRun ? [] : plan.archivedIds,
      summaries: plan.summaries,
    }
  }
}
