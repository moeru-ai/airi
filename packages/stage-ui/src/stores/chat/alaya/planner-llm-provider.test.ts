import type { MemoryLlmProvider } from '@proj-airi/memory-alaya'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlannerLlmProvider } from './planner-llm-provider'

const allowedRetentionReasons = [
  'identity',
  'stable_preference',
  'boundary',
  'relationship_anchor',
  'ongoing_task',
  'recurring_pattern',
  'emotional_peak',
  'assistant_commitment',
  'key_event',
] as const

const generateTextMock = vi.fn()

vi.mock('@xsai/generate-text', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}))

function createFallback(result: unknown): MemoryLlmProvider {
  return {
    async extractCandidates() {
      return result
    },
  }
}

describe('planner llm provider', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  it('falls back when runtime is not configured', async () => {
    const provider = createPlannerLlmProvider({
      fallback: createFallback({
        candidates: [
          {
            shouldStore: true,
            summary: 'fallback memory',
            category: 'fact',
            tags: ['fallback'],
            importance: 6,
            durability: 0.64,
            emotionIntensity: 0,
            retentionReason: 'key_event',
            sourceRefs: [{
              conversationId: 'c1',
              turnId: 't1',
              eventAt: 1000,
            }],
          },
        ],
      }),
      resolveRuntime: () => ({
        enabled: false,
      }),
    })

    const result = await provider.extractCandidates({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      maxPromptTokens: 1200,
      allowedCategories: ['preference', 'fact', 'relationship', 'task', 'constraint', 'event'],
      allowedRetentionReasons: [...allowedRetentionReasons],
      turns: [],
    })

    expect((result as { candidates: unknown[] }).candidates).toHaveLength(1)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('uses real llm response when valid json is returned', async () => {
    generateTextMock.mockResolvedValue({
      text: `{"candidates":[{"shouldStore":true,"summary":"Prefers concise answers.","category":"preference","tags":["user_like"],"importance":8,"durability":0.78,"emotionIntensity":0.1,"retentionReason":"stable_preference","sourceRefs":[{"conversationId":"s1","turnId":"u1","eventAt":1000}]}]}`,
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
      },
    })

    const provider = createPlannerLlmProvider({
      fallback: createFallback({ candidates: [] }),
      resolveRuntime: () => ({
        enabled: true,
        model: 'gpt-test',
        baseURL: 'https://example.com/v1/',
        apiKey: 'test-key',
      }),
    })

    const result = await provider.extractCandidates({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      maxPromptTokens: 1200,
      allowedCategories: ['preference', 'fact', 'relationship', 'task', 'constraint', 'event'],
      allowedRetentionReasons: [...allowedRetentionReasons],
      turns: [
        {
          workspaceId: 'workspace-a',
          sessionId: 'session-a',
          conversationId: 's1',
          turnId: 'u1',
          role: 'user',
          content: 'I prefer concise answers.',
          createdAt: 1000,
          source: { channel: 'test' },
        },
      ],
    })

    const extraction = result as { candidates: Array<{ category: string }>, usage?: { promptTokens: number } }
    expect(extraction.candidates).toHaveLength(1)
    expect(extraction.candidates[0].category).toBe('preference')
    expect(extraction.usage?.promptTokens).toBe(120)
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('falls back on timeout or network-like errors', async () => {
    generateTextMock.mockRejectedValue(new Error('Request timed out'))
    const fallback = vi.fn(async () => ({
      candidates: [
        {
          shouldStore: true,
          summary: 'fallback candidate',
          category: 'fact',
          tags: ['fallback'],
          importance: 5,
          durability: 0.52,
          emotionIntensity: 0,
          retentionReason: 'key_event',
          sourceRefs: [{
            conversationId: 's1',
            turnId: 'u1',
            eventAt: 1000,
          }],
        },
      ],
    }))

    const provider = createPlannerLlmProvider({
      fallback: {
        extractCandidates: fallback,
      },
      resolveRuntime: () => ({
        enabled: true,
        model: 'gpt-test',
        baseURL: 'https://example.com/v1/',
        apiKey: 'test-key',
      }),
    })

    const result = await provider.extractCandidates({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      maxPromptTokens: 1200,
      allowedCategories: ['preference', 'fact', 'relationship', 'task', 'constraint', 'event'],
      allowedRetentionReasons: [...allowedRetentionReasons],
      turns: [
        {
          workspaceId: 'workspace-a',
          sessionId: 'session-a',
          conversationId: 's1',
          turnId: 'u1',
          role: 'user',
          content: 'Need concise output.',
          createdAt: 1000,
          source: { channel: 'test' },
        },
      ],
    })

    expect((result as { candidates: unknown[] }).candidates).toHaveLength(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
