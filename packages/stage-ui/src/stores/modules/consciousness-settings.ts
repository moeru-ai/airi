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
  const temperature = shallowRef(typeof localStorage === 'undefined' ? 0.7 : Number(localStorage.getItem('settings/consciousness/active-temperature') ?? 0.7))
  const topP = shallowRef(typeof localStorage === 'undefined' ? 1 : Number(localStorage.getItem('settings/consciousness/active-top-p') ?? 1))

  async function setTemperature(value: number) {
    temperature.value = value
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/consciousness/active-temperature', String(value))
  }

  async function setTopP(value: number) {
    topP.value = value
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/consciousness/active-top-p', String(value))
  }

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
    await setTemperature(0.7)
    await setTopP(1)
    await setReasoning(false)
    await setTemperatureEnabled(false)
    await setTopPEnabled(false)
  }

  return {
    reasoning,
    temperature,
    topP,
    setTemperature,
    setTopP,
    temperatureEnabled,
    topPEnabled,
    setReasoning,
    setTemperatureEnabled,
    setTopPEnabled,
    resetState,
  }
}, {
  synced: {
    actions: ['resetState', 'setReasoning', 'setTemperatureEnabled', 'setTopPEnabled', 'setTemperature', 'setTopP'],
    state: true,
  },
})
