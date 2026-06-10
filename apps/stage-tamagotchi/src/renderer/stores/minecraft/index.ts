import type { ContextUpdate, WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character/orchestrator/store'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useMinecraftStore } from '@proj-airi/stage-ui/stores/modules/gaming-minecraft'
import { useSystemSpeechStore } from '@proj-airi/stage-ui/stores/modules/system-speech'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { buildMinecraftToolsetPrompt, parseMasterUsername, shouldReadAloud } from './prompt'
import { createRelayToMinecraftTool } from './relay-tool'

/** Module id the in-game bot registers under (and the source id its events carry). */
const MINECRAFT_SOURCE = 'minecraft-bot'
/** Provider key this adapter owns in the shared LLM tools / toolset-prompt registries. */
const MINECRAFT_PROVIDER = 'minecraft'

function eventSourceId(event: { metadata?: { source?: { plugin?: { id?: string }, id?: string } } }): string | undefined {
  return event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id
}

/**
 * Desktop Minecraft adapter: the single owner of the desktop ↔ in-game-bot integration.
 *
 * Use when:
 * - The Tamagotchi renderer is up and should let the character relay the master's intent to the
 *   in-game Airi and read the bot's chat aloud — WITHOUT the generic stage-ui runtime (LLM store,
 *   character orchestrator, chat context providers) carrying any Minecraft-specific knowledge.
 *
 * Expects:
 * - Called via {@link useMinecraftToolsStore.setup} after the server channel client is configured.
 *
 * Returns:
 * - `setup`/`dispose`. setup wires four things and dispose unwinds exactly them:
 *   - registers `relayToMinecraft` into the shared LLM tools store ONLY while the bot is online (a
 *     hard capability gate replacing the old prompt-only "don't relay when offline");
 *   - registers the Minecraft persona directive into the shared toolset-prompt store, re-registered
 *     whenever online/master/runtime-context change so the model gets a fresh directive each turn;
 *   - consumes the bot's own forwarded chat (`minecraft:speech`) into the stage TTS, and binds 主人
 *     from the bot's neutral status text;
 *   - mutes Minecraft-origin `spark:notify` in the orchestrator while this adapter owns the
 *     Minecraft speech/status surface.
 */
export const useMinecraftToolsStore = defineStore('tamagotchi-minecraft-tools', () => {
  const minecraftStore = useMinecraftStore()
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const systemSpeechStore = useSystemSpeechStore()
  const orchestratorStore = useCharacterOrchestratorStore()
  const channelStore = useModsServerChannelStore()

  const { serviceConnected, configured, latestRuntimeContextText } = storeToRefs(minecraftStore)
  // The master's in-game username, parsed from the bot's neutral `minecraft:status` text. Kept here
  // (not in the shared minecraft store) because binding 主人 is a desktop-persona concern.
  const masterUsername = ref('')

  let started = false
  let disposeContextUpdate: (() => void) | null = null
  let stopToolGate: (() => void) | null = null
  let stopPromptSync: (() => void) | null = null

  function sendSparkCommand(command: WebSocketEvents['spark:command']) {
    channelStore.send<WebSocketEvents['spark:command']>({ type: 'spark:command', data: command })
  }

  function registerRelayTool() {
    // registerTools internally tracks the pending Promise (awaitPendingRegistrations), so we don't
    // await it here; the gate just fires register/clear as the bot connects/disconnects.
    void llmToolsStore.registerTools(
      MINECRAFT_PROVIDER,
      createRelayToMinecraftTool({
        sendSparkCommand,
        isAvailable: () => minecraftStore.serviceConnected,
      }),
    )
  }

  function syncToolsetPrompt() {
    if (!configured.value) {
      llmToolsetPromptsStore.clearToolsetPrompts(MINECRAFT_PROVIDER)
      return
    }

    llmToolsetPromptsStore.registerToolsetPrompts(MINECRAFT_PROVIDER, [{
      id: 'minecraft:relay',
      title: 'Minecraft',
      content: buildMinecraftToolsetPrompt({
        online: serviceConnected.value,
        masterUsername: masterUsername.value,
        runtimeContextText: latestRuntimeContextText.value,
      }),
    }])
  }

  function handleContextUpdate(event: WebSocketBaseEvent<'context:update', ContextUpdate>) {
    if (eventSourceId(event) !== MINECRAFT_SOURCE)
      return

    if (event.data.lane === 'minecraft:speech') {
      // The bot's own in-game chat line, forwarded for read-aloud. Speak it (only when it contains
      // Chinese, so English skill/command echoes are skipped). Not stored as state — a one-off line.
      const line = event.data.text ?? ''
      if (shouldReadAloud(line))
        systemSpeechStore.speak(line)
      return
    }

    if (event.data.lane === 'minecraft:status') {
      // Bind 主人 to the actual in-game player. The bot surfaces its owner in neutral status text; we
      // parse it here rather than relying on a desktop-specific hint from the bot service.
      const parsed = parseMasterUsername(event.data.text)
      if (parsed)
        masterUsername.value = parsed
    }
  }

  function setup() {
    if (started)
      return

    started = true
    minecraftStore.initialize()
    // This adapter owns Minecraft speech/status surfacing; muting Minecraft-origin notifies keeps the
    // generic character orchestrator from also waking the desktop persona for that module traffic.
    orchestratorStore.muteNotifySource(MINECRAFT_SOURCE)

    disposeContextUpdate = channelStore.onContextUpdate(handleContextUpdate)

    // Capability gate: the relay tool exists only while the bot is online.
    stopToolGate = watch(serviceConnected, (online) => {
      if (online)
        registerRelayTool()
      else
        llmToolsStore.clearTools(MINECRAFT_PROVIDER)
    }, { immediate: true })

    // Re-register the persona directive whenever the inputs it derives from change.
    stopPromptSync = watch(
      [configured, serviceConnected, masterUsername, latestRuntimeContextText],
      () => syncToolsetPrompt(),
      { immediate: true },
    )
  }

  function dispose() {
    if (!started)
      return

    stopToolGate?.()
    stopPromptSync?.()
    disposeContextUpdate?.()
    stopToolGate = null
    stopPromptSync = null
    disposeContextUpdate = null

    llmToolsStore.clearTools(MINECRAFT_PROVIDER)
    llmToolsetPromptsStore.clearToolsetPrompts(MINECRAFT_PROVIDER)
    orchestratorStore.unmuteNotifySource(MINECRAFT_SOURCE)

    started = false
  }

  return {
    setup,
    dispose,
  }
})
