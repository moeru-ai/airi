import type { SessionFeatures } from '@proj-airi/core-agent'

import { DEFAULT_SESSION_FEATURES, resolveSessionFeatures } from '@proj-airi/core-agent'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useAuthStore } from '../auth'
import { useMemoryStore } from '../memory'
import { useStickersStore } from '../modules/stickers'

/** Defaults without an existing module setting. Other capabilities keep their original configuration owners. */
export const SESSION_DEFAULT_PREFERENCES = ['reactions', 'skills', 'tasks'] as const
export type SessionDefaultPreferences = Pick<SessionFeatures, typeof SESSION_DEFAULT_PREFERENCES[number]>
const initialPreferences: SessionDefaultPreferences = {
  reactions: DEFAULT_SESSION_FEATURES.reactions,
  skills: DEFAULT_SESSION_FEATURES.skills,
  tasks: DEFAULT_SESSION_FEATURES.tasks,
}

/** User preferences persist separately from explicit, leader-owned session restrictions. */
export const useChatFeaturesStore = defineStore('chat-features', () => {
  const auth = useAuthStore()
  const memory = useMemoryStore()
  const stickers = useStickersStore()
  const storageKey = computed(() => `settings/chat/preferences/${auth.userId}`)
  const preferences = useLocalStorageManualReset<SessionDefaultPreferences>(storageKey, initialPreferences)
  const defaults = computed(() => resolveSessionFeatures(DEFAULT_SESSION_FEATURES, {
    ...preferences.value,
    memory: memory.enabled ? 'write' : 'off',
    stickers: stickers.enabled,
  }))

  function setDefaults(change: Partial<SessionDefaultPreferences>) {
    preferences.value = { ...preferences.value, ...change }
  }

  function resetState() {
    preferences.reset()
  }

  return { defaults, setDefaults, resetState }
})
