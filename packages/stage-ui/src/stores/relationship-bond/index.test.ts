import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useRelationshipBondStore } from '.'
import {
  applyRelationshipBondEvent,
  capRelationshipBondEvents,
  createRelationshipBondPromptSummary,
  createRelationshipBondState,
  formatRelationshipBondPromptSummary,
  getRelationshipBondProgress,
  RELATIONSHIP_BOND_MAX_EVENT_HISTORY,
} from './utils'

vi.mock('@proj-airi/stage-shared/composables', () => ({
  useLocalStorageManualReset: <T>(_key: string, initialValue: T) => {
    const state = ref(initialValue)
    return Object.assign(state, {
      reset: () => {
        state.value = initialValue
      },
    })
  },
}))

describe('relationship bond', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
  })

  it('computes deterministic thresholds and stages', () => {
    expect(getRelationshipBondProgress(0)).toMatchObject({ level: 1, stage: 'stranger', progress: 0 })
    expect(getRelationshipBondProgress(20)).toMatchObject({ level: 2, stage: 'stranger' })
    expect(getRelationshipBondProgress(60)).toMatchObject({ level: 3, stage: 'familiar' })
    expect(getRelationshipBondProgress(1000)).toMatchObject({ level: 9, stage: 'cherished', progress: 1 })
  })

  it('clamps xp at the configured cap', () => {
    const nextState = applyRelationshipBondEvent(createRelationshipBondState('card-a'), {
      id: 'evt-1',
      kind: 'user-message',
      summary: 'Overflow attempt',
      emotion: 'positive interaction',
      deltaXp: 500000,
      createdAt: 10,
      sessionId: 'session-a',
    })

    expect(nextState).toMatchObject({ xp: 100000, level: 9, stage: 'cherished' })
  })

  it('caps significant interaction history', () => {
    const events = Array.from({ length: RELATIONSHIP_BOND_MAX_EVENT_HISTORY + 3 }, (_, index) => ({
      id: `evt-${index}`,
      kind: 'user-message' as const,
      summary: `Event ${index}`,
      emotion: 'neutral',
      deltaXp: 1,
      createdAt: index,
      sessionId: 'session-a',
    }))

    const capped = capRelationshipBondEvents(events)
    expect(capped).toHaveLength(RELATIONSHIP_BOND_MAX_EVENT_HISTORY)
    expect(capped[0]?.id).toBe('evt-3')
  })

  it('formats a compact prompt summary', () => {
    const summary = createRelationshipBondPromptSummary({
      ...createRelationshipBondState('card-a'),
      xp: 75,
      level: 3,
      stage: 'familiar',
      eventHistory: [{
        id: 'evt-1',
        kind: 'user-message',
        summary: 'Shared a personal story',
        emotion: 'positive interaction',
        deltaXp: 12,
        createdAt: 42,
        sessionId: 'session-a',
      }],
    })

    expect(formatRelationshipBondPromptSummary(summary)).toContain('Stage: familiar')
    expect(formatRelationshipBondPromptSummary(summary)).toContain('Shared a personal story')
  })

  it('tracks ordinary xp without storing an event and isolates characters', () => {
    const store = useRelationshipBondStore()
    store.recordUserMessageInteraction({
      characterId: 'card-a',
      sessionId: 'session-a',
      summary: 'Hello',
      reason: '普通对话',
      sentimentScore: 0,
      significant: false,
      createdAt: 1,
    })
    store.recordUserMessageInteraction({
      characterId: 'card-b',
      sessionId: 'session-b',
      summary: 'I like you',
      reason: '用户表达喜爱',
      sentimentScore: 20,
      significant: true,
      createdAt: 2,
    })

    expect(store.getBondState('card-a')).toMatchObject({ xp: 5, eventHistory: [] })
    expect(store.getBondState('card-b').xp).toBe(12)
    expect(store.getBondState('card-b').eventHistory).toHaveLength(1)
  })
})
