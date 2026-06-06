import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { VoicePackBindingInput } from './modules/airi-card'

export const useVoicePacksStore = defineStore('voice-packs', () => {
  const packs = ref<VoicePackBindingInput[]>([])
  const loading = ref(false)
  const error = ref<string | undefined>(undefined)

  async function load() {
    loading.value = true
    error.value = undefined
    try {
      packs.value = []
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
    finally {
      loading.value = false
    }
  }

  return { packs, loading, error, load }
})
