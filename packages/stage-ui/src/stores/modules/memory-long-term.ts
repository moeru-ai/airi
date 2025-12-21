import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'

export const useMemoryLongTermStore = defineStore('memory-long-term', () => {
  // State
  const [enabled, resetEnabled] = createResettableLocalStorage('settings/memory/long-term/enabled', false)
  const [vectorDbProvider, resetVectorDbProvider] = createResettableLocalStorage('settings/memory/long-term/vector-db-provider', '')
  const [embeddingProvider, resetEmbeddingProvider] = createResettableLocalStorage('settings/memory/long-term/embedding-provider', '')
  const [embeddingModel, resetEmbeddingModel] = createResettableLocalStorage('settings/memory/long-term/embedding-model', '')
  const [useSqlite, resetUseSqlite] = createResettableLocalStorage('settings/memory/long-term/use-sqlite', false)
  const [sqliteDbPath, resetSqliteDbPath] = createResettableLocalStorage('settings/memory/long-term/sqlite-db-path', '')

  const configured = computed(() => {
    return enabled.value && !!vectorDbProvider.value && !!embeddingProvider.value && !!embeddingModel.value
  })

  function resetState() {
    resetEnabled()
    resetVectorDbProvider()
    resetEmbeddingProvider()
    resetEmbeddingModel()
    resetUseSqlite()
    resetSqliteDbPath()
  }

  return {
    // State
    enabled,
    vectorDbProvider,
    embeddingProvider,
    embeddingModel,
    useSqlite,
    sqliteDbPath,
    configured,

    // Actions
    resetState,
  }
})
