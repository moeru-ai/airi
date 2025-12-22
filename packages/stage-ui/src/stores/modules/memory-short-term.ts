import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'

export const useMemoryShortTermStore = defineStore('memory-short-term', () => {
  // State
  const [enabled, resetEnabled] = createResettableLocalStorage('settings/memory/short-term/enabled', false)
  const [maxMessages, resetMaxMessages] = createResettableLocalStorage('settings/memory/short-term/max-messages', 20)
  const [useSqlite, resetUseSqlite] = createResettableLocalStorage('settings/memory/short-term/use-sqlite', false)
  const [sqliteDbPath, resetSqliteDbPath] = createResettableLocalStorage('settings/memory/short-term/sqlite-db-path', '')

  const configured = computed(() => {
    return enabled.value
  })

  function resetState() {
    resetEnabled()
    resetMaxMessages()
    resetUseSqlite()
    resetSqliteDbPath()
  }

  return {
    // State
    enabled,
    maxMessages,
    useSqlite,
    sqliteDbPath,
    configured,

    // Actions
    resetState,
  }
})
