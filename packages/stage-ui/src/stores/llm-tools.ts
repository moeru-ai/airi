import type { Tool } from '@xsai/shared-chat'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

type ToolRegistration = Promise<Tool[]> | Tool[]

/**
 * Stores runtime-registered xsai tools keyed by provider.
 *
 * Use when:
 * - App runtimes need to publish additional LLM tools into shared stage-ui logic
 *
 * Expects:
 * - Provider names are stable identifiers such as `mcp` or `plugin-tools`
 *
 * Returns:
 * - A merged reactive list of all currently registered tools
 */
export const useLlmToolsStore = defineStore('llm-tools', () => {
  const toolsByProvider = ref<Record<string, Tool[]>>({})
  const providerRegistrationTokens = new Map<string, symbol>()
  const pendingRegistrations = new Map<string, Promise<void>>()

  function assignTools(provider: string, tools: Tool[]) {
    toolsByProvider.value = {
      ...toolsByProvider.value,
      [provider]: [...tools],
    }
  }

  function registerTools(provider: string, tools: ToolRegistration) {
    const registrationToken = Symbol(provider)
    providerRegistrationTokens.set(provider, registrationToken)

    if (Array.isArray(tools)) {
      pendingRegistrations.delete(provider)
      assignTools(provider, tools)
      return Promise.resolve([...tools])
    }

    const registration = Promise.resolve(tools)
      .then((resolvedTools) => {
        if (providerRegistrationTokens.get(provider) !== registrationToken)
          return resolvedTools

        assignTools(provider, resolvedTools)
        return resolvedTools
      })
      .finally(() => {
        if (providerRegistrationTokens.get(provider) === registrationToken)
          pendingRegistrations.delete(provider)
      })

    pendingRegistrations.set(provider, registration.then(() => undefined, () => undefined))
    return registration
  }

  function clearTools(provider: string) {
    providerRegistrationTokens.set(provider, Symbol(provider))
    pendingRegistrations.delete(provider)
    const { [provider]: _removed, ...remaining } = toolsByProvider.value
    toolsByProvider.value = remaining
  }

  async function awaitPendingRegistrations() {
    while (pendingRegistrations.size > 0)
      await Promise.all(pendingRegistrations.values())
  }

  const activeTools = computed(() => Object.values(toolsByProvider.value).flat())

  // TODO: Track provider support/loading/error state if runtime diagnostics need it later.
  return {
    activeTools,
    awaitPendingRegistrations,
    clearTools,
    registerTools,
    toolsByProvider,
  }
})
