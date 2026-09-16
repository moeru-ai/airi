import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

function loadReasoning() {
  // Non-renderer runtimes have no durable settings owner. They use the product
  // default until a synchronized renderer snapshot arrives.
  if (typeof localStorage === 'undefined')
    return false

  return localStorage.getItem('settings/consciousness/reasoning') === 'true'
}

function persistReasoning(value: boolean) {
  if (typeof localStorage === 'undefined')
    return

  localStorage.setItem('settings/consciousness/reasoning', String(value))
}

/**
 * Stores request policies for the consciousness module.
 *
 * Consciousness chat request preparation reads this state before inference.
 * Each provider maps the reasoning value to its own request fields.
 */
export const useConsciousnessSettingsStore = defineStore('consciousness-settings', () => {
  // Pinia owns live cross-window state. Only synchronized actions write the
  // durable value, so a follower cannot persist an uncommitted proposal.
  const reasoning = shallowRef(loadReasoning())

  async function setReasoning(value: boolean) {
    reasoning.value = value
    persistReasoning(value)
  }

  async function resetState() {
    reasoning.value = false
    persistReasoning(false)
  }

  return {
    reasoning,
    setReasoning,
    resetState,
  }
}, {
  synced: {
    actions: ['resetState', 'setReasoning'],
    state: true,
  },
})
