<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { onMcpApprovalSessionEnded } from '@proj-airi/stage-ui/stores/mcp-approval-session'
import { clearMcpToolBridge, notifyMcpToolsChanged, setMcpToolBridge } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-airi/stage-ui/stores/plugin-host-capabilities'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { clearAiriSelfNavigationBridge, setAiriSelfNavigationBridge } from '@proj-airi/stage-ui/tools/airi-self'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronMcpCallTool,
  electronMcpListTools,
  electronMcpToolsChangedEvent,
  electronOpenChat,
  electronOpenSettings,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  electronPromptDesktopAutomationApproval,
  electronStartTrackMousePosition,
  i18nSetLocale,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa'
import { installAiriDebugBridge } from './modules/airi-debug-bridge'
import {
  canAutoApproveComputerUseAction,
  getSessionScopedApprovalGrantScope,
  patchComputerUseTerminalStateWithGrant,
} from './modules/computer-use-approval'
import { isComputerUseMcpCall } from './modules/computer-use-mcp-routing'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'

const { isDark: dark } = useTheme()
const i18n = useI18n()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const serverChannelSettingsStore = useServerChannelSettingsStore()
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()
const cardStore = useAiriCardStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const analyticsStore = useSharedAnalyticsStore()
const pluginHostInspectorStore = usePluginHostInspectorStore()
usePerfTracerBridgeStore()

const context = useElectronEventaContext()
const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
const listPlugins = useElectronEventaInvoke(electronPluginList)
const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
const callMcpToolRaw = useElectronEventaInvoke(electronMcpCallTool)
const promptDesktopAutomationApproval = useElectronEventaInvoke(electronPromptDesktopAutomationApproval)
const openChatWindow = useElectronEventaInvoke(electronOpenChat)
const setLocale = useElectronEventaInvoke(i18nSetLocale)

const computerUseApprovalGrants = new Map<string, { scope: 'terminal_and_apps' | 'pty_session' }>()
const disposeAiriDebugBridge = installAiriDebugBridge({
  openChat: () => openChatWindow(),
  navigateTo: (path: string) => router.push(path),
})

setAiriSelfNavigationBridge({
  navigateTo: async (path: string) => {
    await router.push(path)
    return router.currentRoute.value.fullPath
  },
  getCurrentRoute: () => router.currentRoute.value.fullPath,
})

function patchComputerUseTerminalState(result: any, approvalSessionId?: string) {
  const grant = approvalSessionId ? computerUseApprovalGrants.get(approvalSessionId) : undefined
  return patchComputerUseTerminalStateWithGrant(result, grant)
}

// TODO: we should i18n localize these things.
function buildDesktopApprovalSummary(action: any) {
  const kind = action?.kind
  const input = action?.input || {}

  switch (kind) {
    case 'terminal_exec':
      return `Allow AIRI to execute terminal command: ${String(input.command || '')}`
    case 'pty_create':
      return `Allow AIRI to create an interactive PTY session${input.cwd ? ` in ${String(input.cwd)}` : ''}`
    case 'open_app':
      return `Allow AIRI to open ${String(input.app || 'the requested app')}`
    case 'focus_app':
      return `Allow AIRI to focus ${String(input.app || 'the requested app')}`
    case 'click':
      return `Allow AIRI to click at (${String(input.x)}, ${String(input.y)})`
    case 'type_text':
      return 'Allow AIRI to type text into the current UI target'
    case 'press_keys':
      return `Allow AIRI to press keys: ${Array.isArray(input.keys) ? input.keys.join('+') : ''}`
    case 'scroll':
      return 'Allow AIRI to scroll the current UI target'
    default:
      return `Allow AIRI to execute ${String(kind || 'the requested desktop action')}`
  }
}

async function callMcpTool(payload: any): Promise<any> {
  const result = await callMcpToolRaw(payload)
  const isComputerUse = isComputerUseMcpCall(payload, result)

  if (!isComputerUse)
    return result

  if (payload?.approvalSessionId && payload.name === 'computer_use::terminal_reset_state')
    computerUseApprovalGrants.delete(payload.approvalSessionId)

  if (payload?.approvalSessionId && payload.name === 'computer_use::pty_destroy') {
    const grant = computerUseApprovalGrants.get(payload.approvalSessionId)
    if (grant?.scope === 'pty_session')
      computerUseApprovalGrants.delete(payload.approvalSessionId)
  }

  const structuredContent = result?.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    return patchComputerUseTerminalState(result, payload?.approvalSessionId)

  const approvalContent = structuredContent as Record<string, any>
  if (approvalContent.status !== 'approval_required')
    return patchComputerUseTerminalState(result, payload?.approvalSessionId)

  const toolResult = result?.toolResult
  const approvalToken = toolResult && typeof toolResult === 'object' && typeof (toolResult as Record<string, unknown>).approvalToken === 'string'
    ? String((toolResult as Record<string, unknown>).approvalToken)
    : undefined
  const pendingActionId = approvalContent.pendingActionId
  const action = approvalContent.action
  const actionKind = action?.kind
  if (!pendingActionId || typeof pendingActionId !== 'string' || !approvalToken)
    return patchComputerUseTerminalState(result, payload?.approvalSessionId)

  const grantScope = getSessionScopedApprovalGrantScope(String(actionKind || ''))
  const sessionScoped = Boolean(payload?.approvalSessionId && grantScope)
  const existingGrant = payload?.approvalSessionId ? computerUseApprovalGrants.get(payload.approvalSessionId) : undefined
  if (payload?.approvalSessionId && canAutoApproveComputerUseAction(String(actionKind || ''), existingGrant)) {
    const approved = await callMcpToolRaw({
      name: 'computer_use::desktop_approve_pending_action',
      arguments: { id: pendingActionId, approvalToken },
      approvalSessionId: payload.approvalSessionId,
      requestId: payload?.requestId ? `${payload.requestId}:approve` : undefined,
    })
    return patchComputerUseTerminalState(approved, payload?.approvalSessionId)
  }

  const prompt = await promptDesktopAutomationApproval({
    serverName: 'computer_use',
    toolName: payload.name,
    pendingActionId,
    actionKind: String(actionKind || 'unknown'),
    summary: buildDesktopApprovalSummary(action),
    sessionScoped,
  })

  if (prompt?.approved) {
    if (grantScope && payload?.approvalSessionId)
      computerUseApprovalGrants.set(payload.approvalSessionId, { scope: grantScope })

    const approved = await callMcpToolRaw({
      name: 'computer_use::desktop_approve_pending_action',
      arguments: { id: pendingActionId, approvalToken },
      approvalSessionId: payload?.approvalSessionId,
      requestId: payload?.requestId ? `${payload.requestId}:approve` : undefined,
    })
    return patchComputerUseTerminalState(approved, payload?.approvalSessionId)
  }

  const rejected = await callMcpToolRaw({
    name: 'computer_use::desktop_reject_pending_action',
    arguments: {
      id: pendingActionId,
      approvalToken,
      reason: 'Rejected in AIRI desktop approval dialog',
    },
    approvalSessionId: payload?.approvalSessionId,
    requestId: payload?.requestId ? `${payload.requestId}:reject` : undefined,
  })
  return patchComputerUseTerminalState(rejected, payload?.approvalSessionId)
}

// NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
pluginHostInspectorStore.setBridge({
  list: () => listPlugins(),
  setEnabled: payload => setPluginEnabled(payload),
  loadEnabled: () => loadEnabledPlugins(),
  load: payload => loadPlugin(payload),
  unload: payload => unloadPlugin(payload),
  inspect: () => inspectPluginHost(),
})

// NOTICE: MCP tools are declared from stage-ui and executed during model streaming.
// Register runtime bridge during setup to avoid missing bridge in early tool invocations.
setMcpToolBridge({
  listTools: () => listMcpTools(),
  callTool: payload => callMcpTool(payload),
})

// NOTICE: Forward MCP `notifications/tools/list_changed` push events from main
// to the stage-ui bridge so cached tool snapshots are invalidated in real time.
try {
  context.value.on(electronMcpToolsChangedEvent, () => {
    notifyMcpToolsChanged()
  })
}
catch (error) {
  console.warn('[App] failed to listen for MCP tools changed event:', error)
}

const stopMcpApprovalSessionListener = onMcpApprovalSessionEnded((sessionId) => {
  if (!sessionId)
    return

  computerUseApprovalGrants.delete(sessionId)
})

watch(language, () => {
  i18n.locale.value = language.value
  setLocale(language.value)
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

onMounted(async () => {
  analyticsStore.initialize()
  cardStore.initialize()
  onboardingStore.initializeSetupCheck()

  await chatSessionStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()

  const serverChannelConfig = await getServerChannelConfig()
  serverChannelSettingsStore.websocketTlsConfig = serverChannelConfig.websocketTlsConfig

  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()
  await startTrackingCursorPoint()

  // Expose stage provider definitions to plugin host APIs.
  defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

  if (shouldPublishPluginHostCapabilities()) {
    await reportPluginCapability({
      key: pluginProtocolListProvidersEventName,
      state: 'ready',
      metadata: {
        source: 'stage-ui',
      },
    })
  }

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  disposeAiriDebugBridge()
  clearAiriSelfNavigationBridge()
  stopMcpApprovalSessionListener()
  contextBridgeStore.dispose()
  clearMcpToolBridge()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
