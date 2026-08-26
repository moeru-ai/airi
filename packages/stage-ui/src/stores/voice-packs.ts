import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authedFetch } from '../libs/auth-fetch'
import { SERVER_URL } from '../libs/server'

export interface VoicePackListItem {
  costMultiplier: number
  createdAt: string
  description: null | string
  enabled: boolean
  id: string
  name: string
  params: {
    pitch?: number
    rate?: number
    volume?: number
  }
  updatedAt: string
  voiceId: string
}

/**
 * Loads the enabled Voice Pack library from the AIRI server.
 *
 * Use when:
 * - Settings pages need the curated Voice Pack list before binding one to the
 *   active character card.
 *
 * Expects:
 * - The user is authenticated; {@link authedFetch} refreshes an expired access
 *   token once before surfacing the response.
 *
 * Returns:
 * - Reactive list/error/loading state plus a `load()` action.
 */
export const useVoicePacksStore = defineStore('voice-packs', () => {
  const packs = ref<VoicePackListItem[]>([])
  const loading = ref(false)
  const error = ref<null | string>(null)

  async function load() {
    loading.value = true
    error.value = null

    try {
      const res = await authedFetch(new URL('/api/v1/voice-packs', SERVER_URL))
      if (!res.ok)
        throw new Error(`voice packs upstream ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 256))

      const data = await res.json() as VoicePackListItem[]
      packs.value = data
      return data
    }
    catch (err) {
      error.value = errorMessageFrom(err) ?? 'Unknown error'
      packs.value = []
      return []
    }
    finally {
      loading.value = false
    }
  }

  return { error, load, loading, packs }
})
