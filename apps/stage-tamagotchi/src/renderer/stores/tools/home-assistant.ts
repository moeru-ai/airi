import type { HomeAssistantClient } from '@proj-airi/stage-ui/libs/home-assistant/client'
import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { createHomeAssistantClient } from '@proj-airi/stage-ui/libs/home-assistant/client'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { createHomeAssistantTools } from '@proj-airi/stage-ui/tools/home-assistant'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { homeAssistantGetConfig, homeAssistantRequest } from '../../../shared/eventa/home-assistant'

/**
 * Exposes the Home Assistant tools to the model.
 *
 * Use when:
 * - The stage renderer elects a leader and the runtime tools must be discovered
 *
 * Expects:
 * - The main process registered the Home Assistant service. Every call reaches
 *   Home Assistant through that service, which owns the address and the token.
 *
 * Returns:
 * - A refresh action that mounts the tools once Home Assistant is configured
 */
export const useTamagotchiHomeAssistantStore = defineStore('tamagotchi-home-assistant-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const settings = useHomeAssistantStore()
  const getConfig = useElectronEventaInvoke(homeAssistantGetConfig)
  const request = useElectronEventaInvoke(homeAssistantRequest)
  const toolIdPrefix = 'home-assistant:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  /**
   * Builds a client whose transport is the main process.
   *
   * The renderer never holds the base URL or the token, and it never opens a
   * socket to Home Assistant. It sends a path, and main decides what to do.
   */
  function createClient(): HomeAssistantClient {
    return createHomeAssistantClient(async ({ path, method, body }) => {
      return await request({ path, method, body })
    })
  }

  /**
   * Mounts the tools while the switch is on and Home Assistant holds a usable
   * address and token. Any other state unmounts them, because the model must not
   * see a tool that can only fail.
   */
  async function refresh() {
    llmToolsStore.removeToolsByIds(...registeredToolIds())

    const config = await getConfig()
    // The credential state is recorded whatever the switch says. Gating this
    // read on the switch leaves the mirror false after a cold start, and a user
    // who then turns the switch on changes nothing the watcher can see.
    settings.setHasCredentials(Boolean(config.baseUrl) && config.hasToken)

    if (!settings.enabled || !config.baseUrl || !config.hasToken)
      return

    const tools = await createHomeAssistantTools(createClient())
    // NOTICE: these tools carry no `defaultActive: false` and no
    // `requiresExplicitSelection`, unlike the built-in store. The shared
    // `activeTools` filter drops both of those, so a tool that needs to be
    // visible to the model must not set them.
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  /** Reads the entity count, so the settings page can prove the connection works. */
  async function testConnection(): Promise<number> {
    return (await createClient().listEntities()).length
  }

  function dispose() {
    llmToolsStore.removeToolsByIds(...registeredToolIds())
  }

  // The switch and the saved credential both change `configured`. This store is
  // created in every window, and `refresh` is a synchronized action, so the
  // window that sees the change asks the leader to mount or unmount.
  watch(() => settings.configured, () => {
    void refresh().catch((error) => {
      console.warn('[Home Assistant] Failed to refresh the tools:', error)
    })
  }, { immediate: false })

  return {
    dispose,
    refresh,
    testConnection,
  }
}, {
  synced: {
    actions: ['dispose', 'refresh'],
    state: false,
  },
})
