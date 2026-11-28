import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

function loadEnabled(key: string, defaultValue = false) {
  // Non-renderer runtimes have no durable settings owner. They use the product
  // default until a synchronized renderer snapshot arrives.
  if (typeof localStorage === 'undefined')
    return defaultValue

  const stored = localStorage.getItem(`settings/consciousness/${key}`)
  return stored === null ? defaultValue : stored === 'true'
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
 * The chat store reads `titleGeneration` after each reply.
 */
export const useConsciousnessSettingsStore = defineStore('consciousness-settings', () => {
  // Pinia owns live cross-window state. Only synchronized actions write the
  // durable value, so a follower cannot persist an uncommitted proposal.
  const reasoning = shallowRef(loadEnabled('reasoning'))
  const temperatureEnabled = shallowRef(loadEnabled('temperature-enabled'))
  const topPEnabled = shallowRef(loadEnabled('top-p-enabled'))
  /** Whether the chat store asks the chat model for a title after the first reply of a conversation without one. */
  const titleGeneration = shallowRef(loadEnabled('title-generation', true))

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

  async function setTitleGeneration(value: boolean) {
    titleGeneration.value = value
    persistEnabled('title-generation', value)
  }

  async function resetState() {
    await setReasoning(false)
    await setTemperatureEnabled(false)
    await setTopPEnabled(false)
    await setTitleGeneration(true)
  }

  return {
    reasoning,
    temperatureEnabled,
    topPEnabled,
    titleGeneration,
    setReasoning,
    setTemperatureEnabled,
    setTopPEnabled,
    setTitleGeneration,
    resetState,
  }
}, {
  synced: {
    actions: ['resetState', 'setReasoning', 'setTemperatureEnabled', 'setTopPEnabled', 'setTitleGeneration'],
    state: true,
  },
})
