import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

function loadEnabled(key: string) {
  // Non-renderer runtimes have no durable settings owner. They use the product
  // default until a synchronized renderer snapshot arrives.
  if (typeof localStorage === 'undefined')
    return false

  return localStorage.getItem(`settings/consciousness/${key}`) === 'true'
}

function persistEnabled(key: string, value: boolean) {
  if (typeof localStorage === 'undefined')
    return

  localStorage.setItem(`settings/consciousness/${key}`, String(value))
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
  const reasoning = shallowRef(loadEnabled('reasoning'))
  const temperatureEnabled = shallowRef(loadEnabled('temperature-enabled'))
  const topPEnabled = shallowRef(loadEnabled('top-p-enabled'))

  async function setReasoning(value: boolean) {
    reasoning.value = value
    persistEnabled('reasoning', value)
  }

  async function setTemperatureEnabled(value: boolean) {
    temperatureEnabled.value = value
    persistEnabled('temperature-enabled', value)
  }

  async function setTopPEnabled(value: boolean) {
    topPEnabled.value = value
    persistEnabled('top-p-enabled', value)
  }

  async function resetState() {
    await setReasoning(false)
    await setTemperatureEnabled(false)
    await setTopPEnabled(false)
  }

  return {
    reasoning,
    temperatureEnabled,
    topPEnabled,
    setReasoning,
    setTemperatureEnabled,
    setTopPEnabled,
    resetState,
  }
}, {
  synced: {
    actions: ['resetState', 'setReasoning', 'setTemperatureEnabled', 'setTopPEnabled'],
    state: true,
  },
})
