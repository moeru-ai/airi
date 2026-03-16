import { describe, expect, it, vi } from 'vitest'

import { runPlannerBatch } from './run-planner-batch'

describe('runPlannerBatch', () => {
  it('normalizes llm-selected memories and writes short-term records in batch mode', async () => {
    const saveCheckpoint = vi.fn(async () => {})
    const upsert = vi.fn(async (_records: unknown[]) => ({
      inserted: 1,
      merged: 0,
      skipped: 0,
    }))

    const output = await runPlannerBatch({
      schemaVersion: 'v2',
      runId: 'run-1',
      trigger: 'scheduled',
      now: 1_700_000_000_000,
      scope: {
        workspaceId: 'workspace-a',
        sessionId: 'session-a',
      },
      budget: {
        maxConversations: 4,
        maxTurns: 24,
        maxPromptTokens: 4096,
        maxSourceRefsPerCandidate: 5,
      },
    }, {
      workspaceSource: {
        async listTurns() {
          return {
            turns: [
              {
                workspaceId: 'workspace-a',
                sessionId: 'session-a',
                conversationId: 'conv-1',
                turnId: 'turn-1',
                role: 'user',
                content: 'I like tactical games and detective movies.',
                createdAt: 1_700_000_000_001,
                source: {
                  channel: 'stage-web',
                },
              },
              {
                workspaceId: 'workspace-a',
                sessionId: 'session-a',
                conversationId: 'conv-1',
                turnId: 'turn-2',
                role: 'assistant',
                content: 'I will remember that preference for future recommendations.',
                createdAt: 1_700_000_000_100,
                source: {
                  channel: 'stage-web',
                },
              },
            ],
          }
        },
      },
      shortTermStore: {
        async getCheckpoint() {
          return undefined
        },
        saveCheckpoint,
        upsert,
      },
      llm: {
        async extractCandidates() {
          return {
            candidates: [
              {
                shouldStore: true,
                category: 'preference',
                summary: 'User prefers tactical games and detective movies.',
                tags: ['user_like', 'habit'],
                importance: 8,
                durability: 0.82,
                emotionIntensity: 0.12,
                retentionReason: 'stable_preference',
                sourceRefs: [
                  {
                    conversationId: 'conv-1',
                    turnId: 'turn-1',
                    eventAt: 1_700_000_000_001,
                  },
                ],
              },
            ],
            usage: {
              promptTokens: 234,
              completionTokens: 89,
            },
          }
        },
      },
      embedding: {
        async embed() {
          return {
            model: 'test-embed',
            dimension: 3,
            vectors: [[0.1, 0.2, 0.3]],
          }
        },
      },
    })

    expect(output.processedTurns).toBe(2)
    expect(output.producedCandidates).toBe(1)
    expect(output.droppedCandidates).toBe(0)
    expect(output.records).toHaveLength(1)
    expect(output.records[0]?.embedding.status).toBe('ready')
    expect(output.records[0]?.embedding.vector).toEqual([0.1, 0.2, 0.3])
    expect(output.records[0]?.category).toBe('preference')
    expect(output.records[0]?.durability).toBe(0.82)
    expect(output.records[0]?.retentionReason).toBe('stable_preference')
    expect(output.records[0]?.decay.halfLifeDays).toBeGreaterThan(20)
    expect(upsert).toHaveBeenCalledOnce()
    expect(saveCheckpoint).toHaveBeenCalledOnce()
    expect(output.errors).toHaveLength(0)
  })

  it('keeps llm-selected candidates without additional business-threshold policy filtering', async () => {
    const upsert = vi.fn(async () => ({
      inserted: 1,
      merged: 0,
      skipped: 0,
    }))

    const output = await runPlannerBatch({
      schemaVersion: 'v2',
      runId: 'run-2',
      trigger: 'manual',
      now: 1_700_000_001_000,
      scope: {
        workspaceId: 'workspace-b',
        sessionId: 'session-b',
      },
      budget: {
        maxConversations: 1,
        maxTurns: 12,
        maxPromptTokens: 1024,
        maxSourceRefsPerCandidate: 4,
      },
    }, {
      workspaceSource: {
        async listTurns() {
          return {
            turns: [
              {
                workspaceId: 'workspace-b',
                sessionId: 'session-b',
                conversationId: 'conv-2',
                turnId: 'turn-assistant-commit',
                role: 'assistant',
                content: 'I will remind you tomorrow at 9am.',
                createdAt: 1_700_000_001_200,
                source: {
                  channel: 'stage-web',
                },
              },
            ],
          }
        },
      },
      shortTermStore: {
        async getCheckpoint() {
          return undefined
        },
        async saveCheckpoint() {},
        upsert,
      },
      llm: {
        async extractCandidates() {
          return {
            candidates: [
              {
                shouldStore: true,
                category: 'task',
                summary: 'Assistant committed to remind the user tomorrow at 9am.',
                tags: ['assistant_commitment', 'plan'],
                importance: 8,
                durability: 0.66,
                emotionIntensity: 0,
                retentionReason: 'assistant_commitment',
                sourceRefs: [
                  {
                    conversationId: 'conv-2',
                    turnId: 'turn-assistant-commit',
                    eventAt: 1_700_000_001_200,
                  },
                ],
              },
            ],
          }
        },
      },
    })

    expect(output.producedCandidates).toBe(1)
    expect(output.records).toHaveLength(1)
    expect(output.records[0]?.summary).toContain('remind the user')
    expect(output.records[0]?.retentionReason).toBe('assistant_commitment')
    expect(upsert).toHaveBeenCalledOnce()
  })

  it('rejects outdated planner payload fields instead of coercing them', async () => {
    const upsert = vi.fn(async () => ({
      inserted: 1,
      merged: 0,
      skipped: 0,
    }))

    const output = await runPlannerBatch({
      schemaVersion: 'v2',
      runId: 'run-3',
      trigger: 'manual',
      now: 1_700_000_002_000,
      scope: {
        workspaceId: 'workspace-c',
        sessionId: 'session-c',
      },
      budget: {
        maxConversations: 1,
        maxTurns: 12,
        maxPromptTokens: 1024,
        maxSourceRefsPerCandidate: 4,
      },
    }, {
      workspaceSource: {
        async listTurns() {
          return {
            turns: [
              {
                workspaceId: 'workspace-c',
                sessionId: 'session-c',
                conversationId: 'conv-3',
                turnId: 'turn-legacy',
                role: 'user',
                content: 'My name is Kiriko.',
                createdAt: 1_700_000_002_100,
                source: {
                  channel: 'stage-web',
                },
              },
            ],
          }
        },
      },
      shortTermStore: {
        async getCheckpoint() {
          return undefined
        },
        async saveCheckpoint() {},
        upsert,
      },
      llm: {
        async extractCandidates() {
          return {
            candidates: [
              {
                category: 'fact',
                content: 'The user\'s name is Kiriko.',
                summary: 'The user\'s name is Kiriko.',
                tags: ['user_profile', 'name'],
                importance: 8,
                confidence: 0.95,
                noveltyScore: 0.85,
                emotionalImpact: 0,
                sourceRefs: [
                  {
                    conversationId: 'conv-3',
                    turnId: 'turn-legacy',
                    eventAt: 1_700_000_002_100,
                  },
                ],
              },
            ],
          }
        },
      },
    })

    expect(output.records).toHaveLength(0)
    expect(output.writeResult).toBeUndefined()
    expect(output.errors).toHaveLength(1)
    expect(output.errors[0]?.code).toBe('ALAYA_E_LLM_OUTPUT_INVALID')
    expect(output.errors[0]?.message).toContain('shouldStore')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('requires explicit shouldStore=true on emitted planner candidates', async () => {
    const upsert = vi.fn(async () => ({
      inserted: 1,
      merged: 0,
      skipped: 0,
    }))

    const output = await runPlannerBatch({
      schemaVersion: 'v2',
      runId: 'run-4',
      trigger: 'manual',
      now: 1_700_000_003_000,
      scope: {
        workspaceId: 'workspace-d',
        sessionId: 'session-d',
      },
      budget: {
        maxConversations: 1,
        maxTurns: 8,
        maxPromptTokens: 1024,
        maxSourceRefsPerCandidate: 2,
      },
    }, {
      workspaceSource: {
        async listTurns() {
          return {
            turns: [
              {
                workspaceId: 'workspace-d',
                sessionId: 'session-d',
                conversationId: 'conv-4',
                turnId: 'turn-1',
                role: 'user',
                content: 'I love detective stories.',
                createdAt: 1_700_000_003_100,
                source: {
                  channel: 'stage-web',
                },
              },
            ],
          }
        },
      },
      shortTermStore: {
        async getCheckpoint() {
          return undefined
        },
        async saveCheckpoint() {},
        upsert,
      },
      llm: {
        async extractCandidates() {
          return {
            candidates: [
              {
                category: 'preference',
                summary: 'User likes detective stories.',
                tags: ['user_like'],
                importance: 7,
                durability: 0.82,
                emotionIntensity: 0.05,
                retentionReason: 'stable_preference',
                sourceRefs: [
                  {
                    conversationId: 'conv-4',
                    turnId: 'turn-1',
                    eventAt: 1_700_000_003_100,
                  },
                ],
              },
            ],
          }
        },
      },
    })

    expect(output.records).toHaveLength(0)
    expect(output.writeResult).toBeUndefined()
    expect(output.errors).toHaveLength(1)
    expect(output.errors[0]?.code).toBe('ALAYA_E_LLM_OUTPUT_INVALID')
    expect(output.errors[0]?.message).toContain('shouldStore')
    expect(upsert).not.toHaveBeenCalled()
  })
})
