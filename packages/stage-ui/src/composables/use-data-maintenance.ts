import type { ChatSessionsExport } from '../types/chat-session'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { useModelStore } from '@proj-airi/stage-ui-three'

import { useChatOrchestratorStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useDisplayModelsStore } from '../stores/display-models'
import { useMcpStore } from '../stores/mcp'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useOnboardingStore } from '../stores/onboarding'
import { useProvidersStore } from '../stores/providers'
import {
  useSettingsAudioDevice,
  useSettingsAnalytics,
  useSettingsControlsIsland,
  useSettingsDeveloper,
  useSettingsGeneral,
  useSettingsSpine,
  useSettingsStageModel,
  useSettingsTheme,
} from '../stores/settings'

export function useDataMaintenance() {
  const chatStore = useChatSessionStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const displayModelsStore = useDisplayModelsStore()
  const providersStore = useProvidersStore()
  const settingsStageModelStore = useSettingsStageModel()
  const settingsThemeStore = useSettingsTheme()
  const settingsGeneralStore = useSettingsGeneral()
  const settingsAnalyticsStore = useSettingsAnalytics()
  const settingsSpineStore = useSettingsSpine()
  const settingsControlsIslandStore = useSettingsControlsIsland()
  const settingsDeveloperStore = useSettingsDeveloper()
  const audioSettingsStore = useSettingsAudioDevice()
  const live2dParamsStore = useLive2dParams()
  const live2dSettingsStore = useSettingsLive2d()
  const threeStore = useModelStore()
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

  async function deleteAllModels(): Promise<void> {
    await displayModelsStore.resetDisplayModels()
    settingsStageModelStore.stageModelSelected = 'preset-live2d-1'
    await settingsStageModelStore.updateStageModel()
  }

  async function resetProvidersSettings(): Promise<void> {
    await providersStore.resetProviderSettings()
  }

  function resetModulesSettings(): void {
    hearingStore.resetState()
    speechStore.resetState()
    consciousnessStore.resetState()
    twitterStore.resetState()
    discordStore.resetState()
    factorioStore.resetState()
    minecraftStore.resetState()
  }

  function deleteAllChatSessions(): void {
    chatOrchestrator.cancelPendingSends()
    chatStore.resetAllSessions()
  }

  async function exportChatSessions(): Promise<Blob> {
    const data = await chatStore.exportSessions()
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  }

  function isChatSessionsPayload(payload: unknown): payload is ChatSessionsExport {
    if (!payload || typeof payload !== 'object') return false
    return (payload as { format?: string }).format === 'chat-sessions-index:v1'
  }

  async function importChatSessions(payload: Record<string, unknown>): Promise<void> {
    if (!isChatSessionsPayload(payload)) throw new Error('Invalid chat session export format')
    await chatStore.importSessions(payload)
  }

  async function resetSettingsState(): Promise<void> {
    await settingsStageModelStore.resetState()
    await settingsAnalyticsStore.resetState()
    await settingsGeneralStore.resetState()
    await settingsSpineStore.resetState()
    await settingsThemeStore.resetState()
    await settingsControlsIslandStore.resetState()
    await settingsDeveloperStore.resetState()
    await audioSettingsStore.resetState()
    await live2dParamsStore.resetState()
    await live2dSettingsStore.resetState()
    await threeStore.resetModelStore()
    await mcpStore.resetState()
    await onboardingStore.resetSetupState()
    await airiCardStore.resetState()
  }

  async function deleteAllData(): Promise<void> {
    await deleteAllModels()
    await resetProvidersSettings()
    resetModulesSettings()
    deleteAllChatSessions()
    await resetSettingsState()
  }

  async function resetDesktopApplicationState(): Promise<void> {
    if (!isStageTamagotchi()) return

    await resetSettingsState()
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
