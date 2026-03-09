import type { ShortTermMemoryRecord } from '../contracts/v1'

import { describe, expect, it } from 'vitest'

import { alayaSchemaVersion } from '../contracts/v1'
import { runQueryEngine } from './run-query-engine'

function createRecord(input: {
  memoryId: string
  summary: string
  updatedAt?: number
  retentionStatus?: ShortTermMemoryRecord['retention']['status']
  embedding?: ShortTermMemoryRecord['embedding']
  importance?: number
  durability?: number
  emotionIntensity?: number
  retentionReason?: ShortTermMemoryRecord['retentionReason']
}): ShortTermMemoryRecord {
  const now = 1_700_000_000_000
  return {
    memoryId: input.memoryId,
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    conversationId: 'session-a',
    summary: input.summary,
    category: 'fact',
    tags: ['user_profile'],
    importance: input.importance ?? 7,
    durability: input.durability ?? 0.78,
    emotionIntensity: input.emotionIntensity ?? 0.1,
    retentionReason: input.retentionReason ?? 'identity',
    sourceRefs: [
      {
        conversationId: 'session-a',
        turnId: `${input.memoryId}-turn`,
        eventAt: now - 1000,
      },
    ],
    sourceRange: {
      fromAt: now - 1000,
      toAt: now - 1000,
    },
    embedding: input.embedding ?? {
      status: 'pending',
    },
    retention: {
      status: input.retentionStatus ?? 'active',
    },
    decay: {
      halfLifeDays: 7,
      reinforcedCount: 0,
    },
    eventAt: now - 1000,
    createdAt: now - 900,
    updatedAt: input.updatedAt ?? now - 800,
    lastAccessedAt: now - 800,
    accessCount: 0,
    idempotencyKey: `idem-${input.memoryId}`,
    contentHash: `hash-${input.memoryId}`,
    metadata: {},
  }
}

function baseInput() {
  return {
    schemaVersion: alayaSchemaVersion,
    now: 1_700_000_001_000,
    scope: {
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
    },
    query: {
      text: 'Kiriko user likes tactical games name',
    },
    recall: {
      mode: 'full' as const,
    },
    budget: {
      maxSelected: 8,
      maxContextTokens: 900,
      maxSummaryCharsPerRecord: 280,
    },
  }
}

describe('runQueryEngine', () => {
  it('recalls all active short-term records in full mode', async () => {
    const markAccessed = async () => 2
    const output = await runQueryEngine(baseInput(), {
      shortTermReader: {
        async listActive() {
          return [
            createRecord({
              memoryId: 'stm-1',
              summary: 'User name is Kiriko.',
              updatedAt: 10,
            }),
            createRecord({
              memoryId: 'stm-2',
              summary: 'User likes tactical games.',
              updatedAt: 20,
            }),
            createRecord({
              memoryId: 'stm-3',
              summary: 'Archived memory should not be recalled.',
              retentionStatus: 'archived',
              updatedAt: 30,
            }),
          ]
        },
      },
      activityStore: {
        markAccessed,
      },
    })

    expect(output.errors).toHaveLength(0)
    expect(output.recalled).toHaveLength(2)
    expect(output.selected).toHaveLength(2)
    expect(output.metrics.scannedRecords).toBe(2)
    expect(output.metrics.accessUpdatedRecords).toBe(2)
    expect(output.context.text).toContain('Alaya memory recall (reference-only):')
    expect(output.context.text).toContain('User name is Kiriko.')
    expect(output.context.text).toContain('User likes tactical games.')
  })

  it('uses vector similarity when query embedding and memory embeddings are available', async () => {
    const output = await runQueryEngine(baseInput(), {
      shortTermReader: {
        async listActive() {
          return [
            createRecord({
              memoryId: 'stm-vector-best',
              summary: 'User name captured.',
              embedding: {
                status: 'ready',
                model: 'text-embedding-v4',
                dimension: 3,
                vector: [1, 0, 0],
                generatedAt: 1_700_000_000_000,
              },
              importance: 8,
            }),
            createRecord({
              memoryId: 'stm-vector-low',
              summary: 'Unrelated topic.',
              embedding: {
                status: 'ready',
                model: 'text-embedding-v4',
                dimension: 3,
                vector: [0, 1, 0],
                generatedAt: 1_700_000_000_000,
              },
              importance: 8,
            }),
            createRecord({
              memoryId: 'stm-keyword-fallback',
              summary: 'Kiriko asked for concise replies.',
              embedding: {
                status: 'failed',
                failureReason: 'network error',
                generatedAt: 1_700_000_000_000,
              },
            }),
          ]
        },
      },
      embedding: {
        async embed() {
          return {
            model: 'text-embedding-v4',
            dimension: 3,
            vectors: [[1, 0, 0]],
          }
        },
      },
    })

    expect(output.metrics.queryEmbeddingGenerated).toBe(true)
    expect(output.metrics.vectorScoredRecords).toBe(2)
    expect(output.metrics.keywordScoredRecords).toBe(1)
    expect(output.recalled[0]?.memoryId).toBe('stm-vector-best')
    expect(output.recalled.find(item => item.memoryId === 'stm-keyword-fallback')?.matchMode).toBe('keyword')
  })

  it('falls back to keyword scoring when query embedding fails', async () => {
    const output = await runQueryEngine(baseInput(), {
      shortTermReader: {
        async listActive() {
          return [
            createRecord({
              memoryId: 'stm-keyword',
              summary: 'Kiriko prefers concise responses.',
            }),
          ]
        },
      },
      embedding: {
        async embed() {
          throw new Error('embedding timeout')
        },
      },
    })

    expect(output.recalled).toHaveLength(1)
    expect(output.recalled[0]?.matchMode).toBe('keyword')
    expect(output.errors.find(error => error.code === 'ALAYA_E_QUERY_EMBEDDING_FAILED')).toBeTruthy()
  })

  it('selects records deterministically under context token budget', async () => {
    const output = await runQueryEngine({
      ...baseInput(),
      query: {
        text: 'strategy',
      },
      budget: {
        maxSelected: 3,
        maxContextTokens: 90,
        maxSummaryCharsPerRecord: 280,
      },
    }, {
      shortTermReader: {
        async listActive() {
          return [
            createRecord({
              memoryId: 'stm-a',
              summary: 'Kiriko likes strategy games.',
              importance: 9,
            }),
            createRecord({
              memoryId: 'stm-b',
              summary: 'Kiriko likes tea.',
              importance: 8,
            }),
            createRecord({
              memoryId: 'stm-c',
              summary: 'Kiriko uses concise style.',
              importance: 7,
            }),
          ]
        },
      },
      tokenEstimator: {
        estimate() {
          return 50
        },
      },
    })

    expect(output.recalled).toHaveLength(3)
    expect(output.selected).toHaveLength(1)
    expect(output.selected[0]?.memoryId).toBe('stm-a')
  })
})
