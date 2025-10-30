import type { StructuredMemoryContext, StructuredMemoryFragment } from '../../composables/useMemoryService'

import { computed, reactive } from 'vue'
import { defineStore, storeToRefs } from 'pinia'

import { useAiriCardStore } from './airi-card'

export interface MemoryFragmentSummary {
  id: string
  content: string
  category: string
  importance: number
  emotionalImpact: number
  createdAt: number
  memoryType: string
}

interface MemoryBuckets {
  shortTerm: MemoryFragmentSummary[]
  longTerm: MemoryFragmentSummary[]
}

function normalizeFragment(fragment: StructuredMemoryFragment): MemoryFragmentSummary {
  return {
    id: fragment.id,
    content: fragment.content,
    category: fragment.category,
    importance: fragment.importance,
    emotionalImpact: fragment.emotional_impact,
    createdAt: fragment.created_at,
    memoryType: fragment.memory_type,
  }
}

export const useAiriMemoryStore = defineStore('airi-memory', () => {
  const buckets = reactive(new Map<string, MemoryBuckets>())
  const airiCardStore = useAiriCardStore()
  const { currentModels } = storeToRefs(airiCardStore)

  const activeModelName = computed(() => currentModels.value?.consciousness?.model || 'default')

  function ensureBuckets(modelName: string): MemoryBuckets {
    const existing = buckets.get(modelName)
    if (existing)
      return existing
    const fresh: MemoryBuckets = { shortTerm: [], longTerm: [] }
    buckets.set(modelName, fresh)
    return fresh
  }

  const shortTermMemories = computed(() => ensureBuckets(activeModelName.value).shortTerm)
  const longTermMemories = computed(() => ensureBuckets(activeModelName.value).longTerm)

  function setBuckets(modelName: string, context: StructuredMemoryContext) {
    const bucket = ensureBuckets(modelName)
    bucket.shortTerm = (context.semanticMemory.shortTerm || []).map(normalizeFragment)
    bucket.longTerm = (context.semanticMemory.longTerm || []).map(normalizeFragment)
    buckets.set(modelName, bucket)
  }

  function updateFromContext(context: StructuredMemoryContext, modelName?: string) {
    const target = modelName || activeModelName.value
    setBuckets(target, context)
  }

  function clear(modelName?: string) {
    if (modelName) {
      buckets.delete(modelName)
      return
    }
    buckets.clear()
  }

  return {
    activeModelName,
    shortTermMemories,
    longTermMemories,
    updateFromContext,
    clear,
  }
})
