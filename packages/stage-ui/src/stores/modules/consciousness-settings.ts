import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

function loadThinking() {
  // Non-renderer runtimes have no durable settings owner. They use the product
  // default until a synchronized renderer snapshot arrives.
  if (typeof localStorage === 'undefined')
    return false

  return localStorage.getItem('settings/consciousness/thinking') === 'true'
}

function persistThinking(value: boolean) {
  if (typeof localStorage === 'undefined')
    return

  localStorage.setItem('settings/consciousness/thinking', String(value))
}

/**
 * Stores request policies for the consciousness module.
 *
 * Consciousness chat request preparation reads this state before inference.
 * When thinking is off, each provider applies its declared request fields.
 */
export const useConsciousnessSettingsStore = defineStore('consciousness-settings', () => {
  // Pinia owns live cross-window state. Only synchronized actions write the
  // durable value, so a follower cannot persist an uncommitted proposal.
  const thinking = shallowRef(loadThinking())

  async function setThinking(value: boolean) {
    thinking.value = value
    persistThinking(value)
  }

  async function resetState() {
    thinking.value = false
    persistThinking(false)
  }

  return {
    thinking,
    setThinking,
    resetState,
  }
}, {
  synced: {
    actions: ['resetState', 'setThinking'],
    state: true,
  },
})
