import type { RelationshipBondEvent, RelationshipBondState } from './utils'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import {
  applyRelationshipBondEvent,
  applyRelationshipBondXp,
  createRelationshipBondPromptSummary,
  createRelationshipBondState,
  formatRelationshipBondPromptSummary,
  getRelationshipBondXpDelta,
} from './utils'

export * from './utils'

export const useRelationshipBondStore = defineStore('relationship-bond', () => {
  const bondStates = useLocalStorageManualReset<Record<string, RelationshipBondState>>('relationship-bond-states', {})

  function getBondState(characterId: string): RelationshipBondState {
    return bondStates.value[characterId] ?? createRelationshipBondState(characterId)
  }

  function setBondState(characterId: string, state: RelationshipBondState) {
    bondStates.value = {
      ...bondStates.value,
      [characterId]: state,
    }
  }

  function ensureBondState(characterId: string) {
    if (bondStates.value[characterId])
      return bondStates.value[characterId]

    const state = createRelationshipBondState(characterId)
    setBondState(characterId, state)
    return state
  }

  function recordUserMessageInteraction(input: { characterId: string, sessionId: string, summary: string, reason: string, sentimentScore: number, significant: boolean, createdAt?: number }) {
    const currentState = ensureBondState(input.characterId)
    const createdAt = input.createdAt ?? Date.now()
    const deltaXp = getRelationshipBondXpDelta(input.sentimentScore)
    const event: RelationshipBondEvent | undefined = input.significant
      ? {
          id: nanoid(),
          kind: 'user-message',
          summary: input.summary,
          emotion: input.reason,
          deltaXp,
          createdAt,
          sessionId: input.sessionId,
        }
      : undefined

    const nextState = event
      ? applyRelationshipBondEvent(currentState, event)
      : applyRelationshipBondXp(currentState, deltaXp, createdAt)
    setBondState(input.characterId, nextState)
    return { deltaXp, event, state: nextState }
  }

  function getPromptSummary(characterId: string) {
    return createRelationshipBondPromptSummary(getBondState(characterId))
  }

  function getPromptSummaryText(characterId: string) {
    return formatRelationshipBondPromptSummary(getPromptSummary(characterId))
  }

  const characterIds = computed(() => Object.keys(bondStates.value))

  return {
    bondStates,
    characterIds,
    getBondState,
    ensureBondState,
    setBondState,
    recordUserMessageInteraction,
    getPromptSummary,
    getPromptSummaryText,
    resetState: () => bondStates.reset(),
  }
})
