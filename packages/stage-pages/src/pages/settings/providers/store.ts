import { defineStore } from 'pinia'

export const useProvidersPageStore = defineStore('providersPage', {
  state: () => ({
    lastClickedProviderIndex: 0,
  }),

  actions: {
    setLastClickedProviderIndex(index: number) {
      this.lastClickedProviderIndex = index
    },

    resetLastClickedProviderIndex() {
      this.lastClickedProviderIndex = 0
    },
  },
})
