import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { DEFAULT_THEME_COLORS_HUE, useSettings, useSettingsAudioDevice } from '../stores/settings'
import { defaultModelParameters, useLive2d } from '../stores/live2d'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import type { ChatEntry } from '../stores/chat'
import { useChatStore } from '../stores/chat'
import { useDisplayModelsStore } from '../stores/display-models'
import { useMcpStore } from '../stores/mcp'
import { useOnboardingStore } from '../stores/onboarding'
import { useProvidersStore } from '../stores/providers'

export function useDataMaintenance() {
  const chatStore = useChatStore()
  const displayModelsStore = useDisplayModelsStore()
  const providersStore = useProvidersStore()
  const settingsStore = useSettings()
  const audioSettingsStore = useSettingsAudioDevice()
  const live2dStore = useLive2d()
  const hearingStore = useHearingStore()
  const speechStore = useSpeechStore()
  const consciousnessStore = useConsciousnessStore()
  const twitterStore = useTwitterStore()
  const discordStore = useDiscordStore()
  const factorioStore = useFactorioStore()
  const minecraftStore = useMinecraftStore()
  const mcpStore = useMcpStore()
  const onboardingStore = useOnboardingStore()
  const airiCardStore = useAiriCardStore()

  async function deleteAllModels() {
    await displayModelsStore.resetDisplayModels()
    settingsStore.stageModelSelected = 'preset-live2d-1'
    await settingsStore.updateStageModel()
  }

  async function resetProvidersSettings() {
    await providersStore.resetProviderSettings()
  }

  function resetModulesSettings() {
    hearingStore.activeTranscriptionProvider = ''
    hearingStore.activeTranscriptionModel = ''
    hearingStore.activeCustomModelName = ''

    speechStore.activeSpeechProvider = ''
    speechStore.activeSpeechModel = 'eleven_multilingual_v2'
    speechStore.activeSpeechVoiceId = ''
    speechStore.activeSpeechVoice = undefined
    speechStore.pitch = 0
    speechStore.rate = 1
    speechStore.ssmlEnabled = false
    speechStore.selectedLanguage = 'en-US'

    consciousnessStore.activeProvider = ''
    consciousnessStore.activeModel = ''
    consciousnessStore.activeCustomModelName = ''

    twitterStore.enabled = false
    twitterStore.apiKey = ''
    twitterStore.apiSecret = ''
    twitterStore.accessToken = ''
    twitterStore.accessTokenSecret = ''
    twitterStore.saveSettings()

    discordStore.enabled = false
    discordStore.token = ''
    discordStore.saveSettings()

    factorioStore.enabled = false
    factorioStore.serverAddress = ''
    factorioStore.serverPort = 34197
    factorioStore.username = ''
    factorioStore.saveSettings()

    minecraftStore.enabled = false
    minecraftStore.serverAddress = ''
    minecraftStore.serverPort = 25565
    minecraftStore.username = ''
    minecraftStore.saveSettings()
  }

  function deleteAllChatSessions() {
    chatStore.resetAllSessions()
  }

  function exportChatSessions() {
    const data = chatStore.getAllSessions()
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  }

  function importChatSessions(payload: Record<string, unknown>) {
    const normalizedPayload = payload as Record<string, unknown>
    const sessions: Record<string, ChatEntry[]> = {}

    for (const [sessionId, messages] of Object.entries(normalizedPayload)) {
      if (Array.isArray(messages))
        sessions[sessionId] = messages as ChatEntry[]
    }

    chatStore.replaceSessions(sessions)
  }

  function resetSettingsState() {
    settingsStore.language = ''
    settingsStore.stageModelSelected = 'preset-live2d-1'
    settingsStore.stageViewControlsEnabled = false

    settingsStore.live2dDisableFocus = false
    settingsStore.live2dIdleAnimationEnabled = true
    settingsStore.live2dAutoBlinkEnabled = true
    settingsStore.live2dShadowEnabled = true

    settingsStore.disableTransitions = true
    settingsStore.usePageSpecificTransitions = true

    settingsStore.themeColorsHue = DEFAULT_THEME_COLORS_HUE
    settingsStore.themeColorsHueDynamic = false

    settingsStore.allowVisibleOnAllWorkspaces = true

    audioSettingsStore.enabled = false
    audioSettingsStore.selectedAudioInput = ''
    audioSettingsStore.stopStream()

    live2dStore.position = { x: 0, y: 0 }
    live2dStore.scale = 1
    live2dStore.motionMap = {}
    live2dStore.modelParameters = { ...defaultModelParameters }

    mcpStore.serverCmd = ''
    mcpStore.serverArgs = ''
    mcpStore.connected = false

    onboardingStore.resetSetupState()
    airiCardStore.activeCardId = 'default'
    airiCardStore.cards = new Map()

    void settingsStore.updateStageModel()
  }

  async function deleteAllData() {
    await deleteAllModels()
    await resetProvidersSettings()
    resetModulesSettings()
    deleteAllChatSessions()
    resetSettingsState()
  }

  function resetDesktopApplicationState() {
    if (!isStageTamagotchi())
      return

    resetSettingsState()
    resetModulesSettings()
  }

  return {
    deleteAllModels,
    resetProvidersSettings,
    resetModulesSettings,
    deleteAllChatSessions,
    exportChatSessions,
    importChatSessions,
    deleteAllData,
    resetDesktopApplicationState,
  }
}
