import type { ShortTermMemoryRecord } from '@proj-airi/memory-alaya'

import { describe, expect, it } from 'vitest'

import { createAlayaShortTermMemoryReader } from './short-term-memory-reader'

function createRecord(memoryId: string, status: ShortTermMemoryRecord['retention']['status']): ShortTermMemoryRecord {
  return {
    memoryId,
    workspaceId: 'workspace-a',
    sessionId: 'session-a',
    conversationId: 'session-a',
    summary: `summary-${memoryId}`,
    category: 'fact',
    tags: ['user_profile'],
    importance: 7,
    durability: 0.82,
    emotionIntensity: 0,
    retentionReason: 'identity',
    sourceRefs: [{
      conversationId: 'session-a',
      turnId: `${memoryId}-turn`,
      eventAt: 1_700_000_000_000,
    }],
    embedding: {
      status: 'pending',
    },
    retention: {
      status,
    },
    decay: {
      halfLifeDays: 7,
      reinforcedCount: 0,
    },
    eventAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastAccessedAt: 1_700_000_000_000,
    accessCount: 0,
    idempotencyKey: `idem-${memoryId}`,
    contentHash: `hash-${memoryId}`,
    metadata: {},
  }
}

describe('createAlayaShortTermMemoryReader', () => {
  it('returns only active records for workspace recall', async () => {
    const reader = createAlayaShortTermMemoryReader({
      repo: {
        async getCheckpoint() {
          return undefined
        },
        async saveCheckpoint() {},
        async upsert() {
          return {
            inserted: 0,
            merged: 0,
            skipped: 0,
          }
        },
        async listByWorkspace() {
          return [
            createRecord('stm-active', 'active'),
            createRecord('stm-archived', 'archived'),
            createRecord('stm-deleted', 'deleted'),
          ]
        },
        async deleteMemory() {
          return false
        },
        async clearWorkspace() {
          return 0
        },
        async markAccessed() {
          return 0
        },
        async ensureSchemaVersion() {
          return {
            reset: false,
          }
        },
      },
    })

    const output = await reader.listActive({
      scope: {
        workspaceId: 'workspace-a',
      },
      now: Date.now(),
    })

    expect(output).toHaveLength(1)
    expect(output[0]?.memoryId).toBe('stm-active')
  })
})
