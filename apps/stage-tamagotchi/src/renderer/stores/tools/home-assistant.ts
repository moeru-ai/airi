import type { HomeAssistantClient } from '@proj-airi/stage-ui/libs/home-assistant/client'
import type { HomeAssistantExposureMode } from '@proj-airi/stage-ui/libs/home-assistant/exposure'
import type { HomeAssistantEntitySummary } from '@proj-airi/stage-ui/libs/home-assistant/presentation'
import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { createHomeAssistantClient } from '@proj-airi/stage-ui/libs/home-assistant/client'
import { summarizeEntities } from '@proj-airi/stage-ui/libs/home-assistant/presentation'
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
  /** The number of the refresh in flight, so an earlier one cannot add its tools back. */
  let refreshGeneration = 0

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
    return createHomeAssistantClient(async ({ path, method, body, expectBaseUrl }) => {
      // The pinned address travels with the request, so the main process can
      // refuse it when the stored address moved after the caller read it.
      return await request({ path, method, body, ...(expectBaseUrl === undefined ? {} : { expectBaseUrl }) })
    })
  }

  /**
   * Mounts the tools while the switch is on and Home Assistant holds a usable
   * address and token. Any other state unmounts them, because the model must not
   * see a tool that can only fail.
   *
   * The exposure policy reaches these tools in two ways. The description of each
   * tool states the policy in force at build time, because the model plans from
   * the tool list alone. The executor reads the policy again on every call, so a
   * change the user makes during a model request takes effect at once. Both
   * belong to one feature, and neither replaces the other.
   */
  async function refresh() {
    const generation = ++refreshGeneration

    const config = await getConfig()
    // A refresh a later change started owns the tools. This run read the address
    // and the token the change replaced, and its tool descriptions state the rule
    // the user has replaced too.
    if (generation !== refreshGeneration)
      return

    // The credential state is recorded whatever the switch says. Gating this
    // read on the switch leaves the mirror false after a cold start, and a user
    // who then turns the switch on changes nothing the watcher can see.
    settings.setHasCredentials(Boolean(config.baseUrl) && config.hasToken)

    // The replacements are built before the swap. A model request that resolves
    // its tools during this build still finds the set of the state before it, and
    // a build that fails leaves that set alone.
    const replacements = settings.enabled && config.baseUrl && config.hasToken
      ? await createHomeAssistantTools(createClient(), {
          exposure: () => settings.exposure,
          readInstance: async () => (await getConfig()).baseUrl,
        })
      : []

    if (generation !== refreshGeneration)
      return

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    // NOTICE: these tools carry no `defaultActive: false` and no
    // `requiresExplicitSelection`, unlike the built-in store. The shared
    // `activeTools` filter drops both of those, so a tool that needs to be
    // visible to the model must not set them.
    if (replacements.length) {
      llmToolsStore.addTools(...replacements.map(tool => ({
        ...tool,
        id: `${toolIdPrefix}${tool.function.name}`,
      } satisfies ExecutableTool)))
    }
  }

  /**
   * Lists every device the Home Assistant instance reports.
   *
   * The exposure policy does not apply here. The settings page needs the whole
   * list, because a device the model cannot reach is exactly the one the user
   * must be able to add.
   */
  async function listEntities(): Promise<HomeAssistantEntitySummary[]> {
    return summarizeEntities(await createClient().listEntities())
  }

  /**
   * Replaces the whole access policy, in the leader.
   *
   * The tools run in the leader window, so its copy of the policy is the one a
   * model call reads. A settings change reaches the leader through a storage
   * event that runs on its own schedule, so a rule the user just replaced stays
   * in force for an in-flight call. The settings window writes its own copy
   * at once and awaits this action, so the control the user touched answers
   * without a round trip and the leader holds the same rule before the model can
   * read it.
   */
  async function setPolicy(mode: HomeAssistantExposureMode, allowedEntityIds: string[], deniedEntityIds: string[]) {
    settings.exposureMode = mode
    settings.allowedEntities = [...allowedEntityIds]
    settings.deniedEntities = [...deniedEntityIds]
  }

  function dispose() {
    llmToolsStore.removeToolsByIds(...registeredToolIds())
  }

  // The switch, the saved credential, and the exposure policy each change what
  // the model must see. This store is created in every window, and `refresh` is a
  // synchronized action, so the window that sees the change asks the leader to
  // mount or unmount.
  watch([() => settings.configured, () => settings.exposure], () => {
    void refresh().catch((error) => {
      console.warn('[Home Assistant] Failed to refresh the tools:', error)
    })
  }, { immediate: false })

  return {
    dispose,
    refresh,
    listEntities,
    setPolicy,
  }
}, {
  synced: {
    actions: ['dispose', 'refresh', 'setPolicy'],
    state: false,
  },
})
