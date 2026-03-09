import { describe, expect, it } from 'vitest'

import { createHeuristicPlannerLlmProvider } from './heuristic-planner-llm-provider'

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

describe('heuristic planner llm provider', () => {
  it('extracts preference and constraint candidates from meaningful turns', async () => {
    const provider = createHeuristicPlannerLlmProvider()
    const result = await provider.extractCandidates({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      maxPromptTokens: 2000,
      allowedCategories: ['preference', 'fact', 'relationship', 'task', 'constraint', 'event'],
      allowedRetentionReasons: [...allowedRetentionReasons],
      turns: [
        {
          workspaceId: 'workspace-a',
          sessionId: 'session-a',
          conversationId: 'session-a',
          turnId: 't1',
          role: 'user',
          content: 'hello',
          createdAt: 1000,
          source: { channel: 'test' },
        },
        {
          workspaceId: 'workspace-a',
          sessionId: 'session-a',
          conversationId: 'session-a',
          turnId: 't2',
          role: 'user',
          content: 'I prefer concise technical explanations and clear API boundaries.',
          createdAt: 1001,
          source: { channel: 'test' },
        },
        {
          workspaceId: 'workspace-a',
          sessionId: 'session-a',
          conversationId: 'session-a',
          turnId: 't3',
          role: 'user',
          content: 'Please do not store temporary greetings in memory.',
          createdAt: 1002,
          source: { channel: 'test' },
        },
      ],
    })

    const extraction = result as { candidates: Array<{ category: string, tags: string[] }> }
    expect(extraction.candidates).toHaveLength(2)
    expect(extraction.candidates[0].category).toBe('preference')
    expect(extraction.candidates[0].tags).toContain('user_like')
    expect(extraction.candidates[1].category).toBe('constraint')
    expect(extraction.candidates[1].tags).toContain('explicit_request')
  })
})
