import type { ChatReasoningMode } from '@proj-airi/provider-inference'
import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * Reasoning policy chosen for Consciousness chat requests.
 *
 * - `default`: omits the reasoning override so each provider applies its own default or provider-level setting.
 * - `enabled`: requests thinking on for chat turns.
 * - `disabled`: requests thinking off for chat turns.
 */
export type ConsciousnessReasoningMode = 'default' | ChatReasoningMode

function isConsciousnessReasoningMode(value: string | null): value is ConsciousnessReasoningMode {
  return value === 'default' || value === 'enabled' || value === 'disabled'
}

function loadReasoning(): ConsciousnessReasoningMode {
  // Non-renderer runtimes have no durable settings owner. They use the product
  // default until a synchronized renderer snapshot arrives.
  if (typeof localStorage === 'undefined')
    return 'default'

  const stored = localStorage.getItem('settings/consciousness/reasoning')
  return isConsciousnessReasoningMode(stored) ? stored : 'default'
}

function persistReasoning(value: ConsciousnessReasoningMode) {
  if (typeof localStorage === 'undefined')
    return

  localStorage.setItem('settings/consciousness/reasoning', value)
}

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
 * Each provider maps explicit reasoning modes to its own request fields.
 */
export const useConsciousnessSettingsStore = defineStore('consciousness-settings', () => {
  // Pinia owns live cross-window state. Only synchronized actions write the
  // durable value, so a follower cannot persist an uncommitted proposal.
  const reasoning = shallowRef<ConsciousnessReasoningMode>(loadReasoning())
  const temperatureEnabled = shallowRef(loadEnabled('temperature-enabled'))
  const topPEnabled = shallowRef(loadEnabled('top-p-enabled'))

  async function setReasoning(value: ConsciousnessReasoningMode) {
    reasoning.value = value
    persistReasoning(value)
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
    await setReasoning('default')
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
