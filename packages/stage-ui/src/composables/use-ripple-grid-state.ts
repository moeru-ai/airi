import { defineStore } from 'pinia'
import { computed } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'

// inlined store since this shouldn't be used anywhere else
const useRippleGridStore = defineStore('rippleGrid', {
  state: () => ({
    clickedIndices: new Map<string, number>(),
  }),

  actions: {
    setClickedIndex(key: string, index: number) {
      this.clickedIndices.set(key, index)
    },

    getClickedIndex(key: string) {
      return this.clickedIndices.get(key) ?? 0
    },

    resetClickedIndex(key: string) {
      this.clickedIndices.delete(key)
    },
  },
})

export function useRippleGridState(key?: string) {
  const route = useRoute()
  const store = useRippleGridStore()

  const stateKey = key || route.fullPath

  const lastClickedIndex = computed(() => store.getClickedIndex(stateKey))

  function setLastClickedIndex(index: number) {
    store.setClickedIndex(stateKey, index)
  }

  onBeforeRouteLeave((to) => {
    if (!to.path.startsWith(stateKey)) {
      store.resetClickedIndex(stateKey)
    }
  })

  return {
    lastClickedIndex,
    setLastClickedIndex,
  }
}
