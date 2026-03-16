import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'
import { fetchModuleRuntimeLogs, prepareModuleRuntime } from '../module-runtime-bridge'
import { useProvidersStore } from '../providers'
import { useSpeechStore } from './speech'

export type QQConnectionMethod = 'official' | 'napcat'
export type QQVoiceReplyMode = 'text' | 'voice' | 'both'
type QQLogLevel = 'info' | 'warn' | 'error'
interface QQRuntimeLogEntry {
  id: string
  level: QQLogLevel
  at: string
  message: string
}

// NOTICE: ANSI escape stripping requires matching ESC (`\u001B`) explicitly.
function stripAnsi(text: string) {
  const chars: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 27 && text[i + 1] === '[') {
      i += 2
      while (i < text.length && text[i] !== 'm') {
        i++
      }
      continue
    }
    chars.push(text[i])
  }
  return chars.join('')
}

type QQVoiceGenerationStatus = 'idle' | 'generating' | 'success' | 'failed'

interface QQTtsConfigPayload {
  providerId: string
  providerConfig?: Record<string, unknown>
  model: string
  voice: string
  outputFormat?: 'mp3' | 'wav' | 'flac' | 'silk'
  speed?: number
  pitch?: number
}

export const useQQStore = defineStore('qq', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const modsServerChannel = useModsServerChannelStore()
  const providersStore = useProvidersStore()
  const speechStore = useSpeechStore()
  const {
    configured: speechConfigured,
    activeSpeechProvider,
    activeSpeechModel,
    activeSpeechVoiceId,
    rate: speechRate,
    pitch: speechPitch,
  } = storeToRefs(speechStore)

  const enabled = useLocalStorageManualReset<boolean>('settings/qq/enabled', false)
  const method = useLocalStorageManualReset<QQConnectionMethod>('settings/qq/method', 'official')
  const officialAppId = useLocalStorageManualReset<string>('settings/qq/official-app-id', '')
  const officialAppSecret = useLocalStorageManualReset<string>('settings/qq/official-app-secret', '')
  const napcatWsUrl = useLocalStorageManualReset<string>('settings/qq/napcat/ws-url', '')
  const voiceReplyMode = useLocalStorageManualReset<QQVoiceReplyMode>('settings/qq/voice-reply-mode', 'text')
  const voiceGenerationStatus = ref<QQVoiceGenerationStatus>('idle')
  const voiceGenerationLastMessage = ref('')
  const connectionStatus = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const connectionMessage = ref('')
  const connectionError = ref('')
  const runtimeLogs = ref<QQRuntimeLogEntry[]>([])
  let runtimeLogCursor = 0
  let runtimeLogsPollTimer: ReturnType<typeof setInterval> | null = null
  let runtimeLogBridgeUnavailable = false
  let connectionTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  let autoConnectRetryTimer: ReturnType<typeof setTimeout> | null = null
  const officialCredentialsReady = computed(() => {
    return officialAppId.value.trim().length > 0 && officialAppSecret.value.trim().length > 0
  })
  const napcatWsReady = computed(() => napcatWsUrl.value.trim().length > 0)

  function isConnectionConfigReady() {
    if (!enabled.value)
      return false

    return method.value === 'official'
      ? officialCredentialsReady.value
      : napcatWsReady.value
  }

  async function waitForConnectionConfigReady(timeoutMs = 5000, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (isConnectionConfigReady())
        return true

      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    return isConnectionConfigReady()
  }

  function appendRuntimeLog(level: QQLogLevel, message: string, at?: string) {
    runtimeLogs.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level,
      at: at || new Date().toISOString(),
      message,
    })

    if (runtimeLogs.value.length > 300) {
      runtimeLogs.value.splice(0, runtimeLogs.value.length - 300)
    }
  }

  function clearRuntimeLogs() {
    runtimeLogs.value = []
    runtimeLogCursor = 0
    runtimeLogBridgeUnavailable = false
  }

  async function pollRuntimeLogsOnce() {
    let result: Awaited<ReturnType<typeof fetchModuleRuntimeLogs>>
    try {
      result = await fetchModuleRuntimeLogs({
        moduleName: 'qq',
        afterId: runtimeLogCursor,
        limit: 200,
      })
    }
    catch (error) {
      appendRuntimeLog('error', `[runtime-bridge] failed to fetch runtime logs: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    if (!result) {
      if (!runtimeLogBridgeUnavailable) {
        runtimeLogBridgeUnavailable = true
        appendRuntimeLog('warn', '[runtime-bridge] runtime log bridge unavailable in current app context')
      }
      stopRuntimeLogsPolling()
      return
    }

    if (!result.logs?.length)
      return

    for (const log of result.logs) {
      runtimeLogCursor = Math.max(runtimeLogCursor, log.id)
      const plain = stripAnsi(log.message)
      appendRuntimeLog(log.level, `[${log.source}] ${plain}`, log.at)

      // Fallback state sync when module:status events are delayed/lost:
      // drive status directly from qq-bot runtime logs.
      if (plain.includes('QQ gateway session is ready')) {
        clearConnectionTimeout()
        connectionStatus.value = 'connected'
        connectionMessage.value = 'QQ official bot and AIRI websocket are connected.'
        connectionError.value = ''
      }

      if (plain.includes('AIRI websocket error') || plain.includes('Failed to connect QQ gateway')) {
        clearConnectionTimeout()
        connectionStatus.value = 'error'
        connectionMessage.value = ''
        connectionError.value = plain
      }

      if (plain.includes('[tts] generating')) {
        voiceGenerationStatus.value = 'generating'
        voiceGenerationLastMessage.value = plain
      }
      if (plain.includes('[tts] sent')) {
        voiceGenerationStatus.value = 'success'
        voiceGenerationLastMessage.value = plain
      }
      if (plain.includes('[tts] failed')) {
        voiceGenerationStatus.value = 'failed'
        voiceGenerationLastMessage.value = plain
      }
    }
  }

  function stopRuntimeLogsPolling() {
    if (!runtimeLogsPollTimer)
      return

    clearInterval(runtimeLogsPollTimer)
    runtimeLogsPollTimer = null
  }

  function startRuntimeLogsPolling() {
    stopRuntimeLogsPolling()
    void pollRuntimeLogsOnce()
    runtimeLogsPollTimer = setInterval(() => {
      void pollRuntimeLogsOnce()
    }, 1000)
  }

  function clearConnectionTimeout() {
    if (!connectionTimeoutTimer)
      return

    clearTimeout(connectionTimeoutTimer)
    connectionTimeoutTimer = null
  }

  function clearAutoConnectRetry() {
    if (!autoConnectRetryTimer)
      return

    clearTimeout(autoConnectRetryTimer)
    autoConnectRetryTimer = null
  }

  function scheduleConnectionTimeout() {
    clearConnectionTimeout()
    connectionTimeoutTimer = setTimeout(() => {
      if (connectionStatus.value !== 'connecting')
        return

      connectionStatus.value = 'error'
      connectionMessage.value = ''
      connectionError.value = 'QQ connection timeout: no status from qq-bot. Please check qq-bot and AIRI runtime logs.'
      appendRuntimeLog('error', connectionError.value)
    }, 20_000)
  }

  const ttsConfigured = computed(() => {
    return speechConfigured.value
      && activeSpeechProvider.value.trim() !== ''
      && activeSpeechProvider.value !== 'speech-noop'
      && activeSpeechModel.value.trim() !== ''
      && activeSpeechVoiceId.value.trim() !== ''
  })

  function buildTtsConfigPayload(): QQTtsConfigPayload | null {
    if (!ttsConfigured.value)
      return null

    const providerId = activeSpeechProvider.value
    const providerConfig = providersStore.getProviderConfig(providerId) ?? {}
    const model = activeSpeechModel.value
    const voice = activeSpeechVoiceId.value

    const outputFormat: QQTtsConfigPayload['outputFormat'] = providerId.includes('openai') ? 'mp3' : undefined

    return {
      providerId,
      providerConfig,
      model,
      voice,
      outputFormat,
      speed: speechRate.value,
      pitch: speechPitch.value,
    }
  }

  async function saveSettings() {
    const officialToken = `${officialAppId.value.trim()}:${officialAppSecret.value.trim()}`
    const wantsVoice = voiceReplyMode.value !== 'text'
    const tts = wantsVoice ? buildTtsConfigPayload() : null
    const configPayload = {
      enabled: enabled.value,
      method: method.value,
      officialAppId: officialAppId.value,
      officialAppSecret: officialAppSecret.value,
      officialToken,
      napcatWsUrl: napcatWsUrl.value,
      voiceReplyMode: voiceReplyMode.value,
      tts: tts || undefined,
    }

    if (!enabled.value) {
      clearAutoConnectRetry()
      connectionStatus.value = 'idle'
      connectionMessage.value = ''
      connectionError.value = ''
    }
    else if (method.value === 'official') {
      clearRuntimeLogs()
      connectionStatus.value = 'connecting'
      connectionMessage.value = 'Starting QQ official runtime and waiting for connection...'
      connectionError.value = ''
      appendRuntimeLog('info', connectionMessage.value)
      startRuntimeLogsPolling()
      scheduleConnectionTimeout()
    }
    else {
      connectionStatus.value = 'idle'
      connectionMessage.value = ''
      connectionError.value = ''
      stopRuntimeLogsPolling()
      clearConnectionTimeout()
    }

    try {
      const runtimePrepared = await prepareModuleRuntime({
        moduleName: 'qq',
        config: configPayload,
      })

      if (enabled.value && method.value === 'official' && !runtimePrepared) {
        appendRuntimeLog('warn', 'QQ runtime bridge unavailable: auto-start skipped, continuing with config push to existing AIRI/qq-bot connection.')
      }

      if (runtimePrepared?.websocketUrl) {
        modsServerChannel.websocketUrl = runtimePrepared.websocketUrl
        appendRuntimeLog('info', `Using AIRI websocket: ${runtimePrepared.websocketUrl}`)
      }

      if (enabled.value && method.value === 'official' && runtimePrepared?.ready) {
        clearConnectionTimeout()
        connectionStatus.value = 'connected'
        connectionMessage.value = 'QQ official bot and AIRI websocket are connected.'
        connectionError.value = ''
        appendRuntimeLog('info', 'QQ runtime already ready, marked as connected.')
      }
      else if (enabled.value && method.value === 'official' && runtimePrepared?.error) {
        clearConnectionTimeout()
        stopRuntimeLogsPolling()
        connectionStatus.value = 'error'
        connectionMessage.value = ''
        connectionError.value = runtimePrepared.error
        appendRuntimeLog('error', `QQ runtime reported error: ${runtimePrepared.error}`)
      }
    }
    catch (error) {
      clearConnectionTimeout()
      stopRuntimeLogsPolling()
      connectionStatus.value = 'error'
      connectionError.value = error instanceof Error ? error.message : String(error)
      appendRuntimeLog('error', connectionError.value)
    }

    configurator.updateFor('qq', {
      ...configPayload,
    })
  }

  modsServerChannel.onEvent('module:status', (event) => {
    const identity = event.data.identity?.plugin?.id
    if (identity !== 'qq-bot' && identity !== 'qq')
      return

    if (event.data.phase === 'ready') {
      clearConnectionTimeout()
      connectionStatus.value = 'connected'
      connectionMessage.value = 'QQ official bot and AIRI websocket are connected.'
      connectionError.value = ''
      appendRuntimeLog('info', connectionMessage.value)
      return
    }

    if (event.data.phase === 'failed') {
      clearConnectionTimeout()
      stopRuntimeLogsPolling()
      connectionStatus.value = 'error'
      connectionMessage.value = ''
      connectionError.value = event.data.reason || 'QQ runtime connection failed.'
      appendRuntimeLog('error', connectionError.value)
      return
    }

    if (event.data.phase === 'preparing' || event.data.phase === 'configured') {
      connectionStatus.value = 'connecting'
      connectionMessage.value = typeof event.data.reason === 'string'
        ? event.data.reason
        : 'QQ runtime is connecting...'
      connectionError.value = ''
      appendRuntimeLog('info', connectionMessage.value)
      scheduleConnectionTimeout()
    }
  })

  const configured = computed(() => {
    return connectionStatus.value === 'connected'
  })

  async function initializeAutoConnect() {
    if (!enabled.value)
      return

    if (!isConnectionConfigReady()) {
      const ready = await waitForConnectionConfigReady()
      if (!ready) {
        appendRuntimeLog('warn', 'QQ auto-connect skipped: configuration not ready yet.')
        clearAutoConnectRetry()
        autoConnectRetryTimer = setTimeout(() => {
          autoConnectRetryTimer = null
          void initializeAutoConnect()
        }, 5000)
        return
      }
    }

    clearAutoConnectRetry()
    await saveSettings()
  }

  function resetState() {
    stopRuntimeLogsPolling()
    clearConnectionTimeout()
    clearAutoConnectRetry()
    enabled.reset()
    method.reset()
    officialAppId.reset()
    officialAppSecret.reset()
    napcatWsUrl.reset()
    voiceReplyMode.reset()
    saveSettings()
  }

  watch(enabled, (isEnabled, wasEnabled) => {
    if (isEnabled === wasEnabled)
      return

    if (!isEnabled) {
      void saveSettings()
      return
    }

    if (isConnectionConfigReady()) {
      void saveSettings()
    }
  })

  watch([method, officialCredentialsReady, napcatWsReady], (current, previous) => {
    if (!enabled.value)
      return

    const [currentMethod, currentOfficialReady, currentNapcatReady] = current
    const [previousMethod, previousOfficialReady, previousNapcatReady] = previous

    const officialBecameReady = currentMethod === 'official'
      && currentOfficialReady
      && (previousMethod !== 'official' || !previousOfficialReady)
    const napcatBecameReady = currentMethod === 'napcat'
      && currentNapcatReady
      && (previousMethod !== 'napcat' || !previousNapcatReady)

    if (officialBecameReady || napcatBecameReady) {
      void saveSettings()
    }
  })

  return {
    enabled,
    method,
    officialAppId,
    officialAppSecret,
    napcatWsUrl,
    voiceReplyMode,
    voiceGenerationStatus,
    voiceGenerationLastMessage,
    ttsConfigured,
    connectionStatus,
    connectionMessage,
    connectionError,
    runtimeLogs,
    configured,
    clearRuntimeLogs,
    initializeAutoConnect,
    saveSettings,
    resetState,
  }
})
