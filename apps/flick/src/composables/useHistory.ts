import type { DecisionAnalysis, DirectionCard, SpinnerLocale } from '../utils/flick-engine'

import { useStorage } from '@vueuse/core'

export interface HistoryEntry {
  id: number
  createdAt: string
  question: string
  locale: SpinnerLocale
  revealed: DirectionCard
  analysis: DecisionAnalysis
}

const MAX_HISTORY = 20

export function useHistory() {
  const history = useStorage<HistoryEntry[]>('flick:v1-history', [])

  function addEntry(entry: Omit<HistoryEntry, 'id' | 'createdAt'>) {
    const newEntry: HistoryEntry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      ...entry,
    }
    history.value = [newEntry, ...history.value].slice(0, MAX_HISTORY)
    return newEntry
  }

  function deleteEntry(id: number) {
    history.value = history.value.filter(entry => entry.id !== id)
  }

  function clearHistory() {
    history.value = []
  }

  return {
    history,
    addEntry,
    deleteEntry,
    clearHistory,
  }
}
