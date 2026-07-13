import type { MemoryRecord } from '../../types/memory'

import { ref } from 'vue'

import { memoryRepo } from '../../database/repos/memory.repo'
import { useAiriCardStore } from '../../stores/modules/airi-card'

const LOCAL_USER_ID = 'local'

/**
 * Reactive view of the stored memories for the active character, for the settings memory browser.
 *
 * Use when:
 * - Rendering the memory list and offering delete / clear-all controls.
 *
 * Returns:
 * - `memories` (most-recently-updated first), `loading`, and `refresh` / `remove` / `clearAll`
 *   actions. Reads/writes go straight to the store repo for the current character + local user.
 */
export function useMemoryBrowser() {
  const cardStore = useAiriCardStore()

  const memories = ref<MemoryRecord[]>([])
  const loading = ref(false)

  function scope() {
    return { character: cardStore.activeCardId, userId: LOCAL_USER_ID }
  }

  async function refresh() {
    loading.value = true
    try {
      const list = await memoryRepo.list(scope())
      memories.value = list.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    finally {
      loading.value = false
    }
  }

  async function remove(id: string) {
    await memoryRepo.delete(scope(), id)
    await refresh()
  }

  async function clearAll() {
    await memoryRepo.clear(scope())
    await refresh()
  }

  return { memories, loading, refresh, remove, clearAll }
}
