import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'
import { fetchModuleRuntimeLogs, prepareModuleRuntime } from '../module-runtime-bridge'
import { useProvidersStore } from '../providers'
import { useConsciousnessStore } from './consciousness'
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

export interface QQMemeImageConfig {
  id: string
  name: string
  mimeType: string
  dataBase64: string
}

export interface QQEmotionMemePackConfig {
  state: string
  images: QQMemeImageConfig[]
}

function normalizeEmotionMemePacks(packs: QQEmotionMemePackConfig[]): QQEmotionMemePackConfig[] {
  return packs.map(pack => ({
    state: pack.state,
    images: pack.images.map(image => ({ ...image })),
  }))
}

function mergeEmotionMemePacks(sources: QQEmotionMemePackConfig[][]): QQEmotionMemePackConfig[] {
  const mergedByState = new Map<string, QQEmotionMemePackConfig>()
  let unnamedIndex = 0

  for (const source of sources) {
    for (const pack of source) {
      const normalizedState = pack.state.trim().toLowerCase()
      const stateKey = normalizedState || `__unnamed__${unnamedIndex++}`
      const existing = mergedByState.get(stateKey)

      if (!existing) {
        mergedByState.set(stateKey, {
          state: pack.state,
          images: [],
        })
      }
      else if (!existing.state && pack.state) {
        existing.state = pack.state
      }

      const targetPack = mergedByState.get(stateKey)!
      const seenImages = new Set(targetPack.images.map(image => `${image.id}|${image.name}|${image.mimeType}|${image.dataBase64}`))

      for (const image of pack.images) {
        const imageKey = `${image.id}|${image.name}|${image.mimeType}|${image.dataBase64}`
        if (seenImages.has(imageKey))
          continue

        seenImages.add(imageKey)
        targetPack.images.push({ ...image })
      }
    }
  }

  return Array.from(mergedByState.values())
}

function stripAnsi(text: string) {
  let output = ''
  let index = 0

  while (index < text.length) {
    const current = text[index]
    const next = text[index + 1]

    if (current === '\u001B' && next === '[') {
      index += 2

      while (index < text.length) {
        const code = text.charCodeAt(index)
        index += 1
        if (code >= 0x40 && code <= 0x7E) {
          break
        }
      }

      continue
    }

    output += current
    index += 1
  }

  return output
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

interface QQVisionConfigPayload {
  providerId?: string
  model?: string
  supportsImageInput: boolean
  supportsVideoInput: boolean
}

function hasVisionCapabilityTag(capabilities: unknown): boolean {
  if (!Array.isArray(capabilities))
    return false

  return capabilities.some((capability) => {
    if (typeof capability !== 'string')
      return false
    return /vision|image|multimodal|omni|video|vl/i.test(capability)
  })
}

function inferModelSupportsVision(modelId: string, capabilities?: unknown): boolean {
  if (hasVisionCapabilityTag(capabilities))
    return true

  return /gpt-4o|gpt-4\.1|gpt-5|gemini|claude-3|claude-sonnet|qwen.*vl|internvl|llava|minicpm-v|glm-4v|vision|multimodal|omni/i.test(modelId)
}

export const useQQStore = defineStore('qq', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const modsServerChannel = useModsServerChannelStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const {
    activeProvider: activeConsciousnessProvider,
    activeModel: activeConsciousnessModel,
  } = storeToRefs(consciousnessStore)
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
  const napcatWsToken = useLocalStorageManualReset<string>('settings/qq/napcat/ws-token', '')
  const napcatHttpApiUrl = useLocalStorageManualReset<string>('settings/qq/napcat/http-api-url', '')
  const napcatHttpApiToken = useLocalStorageManualReset<string>('settings/qq/napcat/http-api-token', '')
  const napcatGroupOnlyReplyAt = useLocalStorageManualReset<boolean>('settings/qq/napcat/group-only-reply-at', true)
  const voiceReplyMode = useLocalStorageManualReset<QQVoiceReplyMode>('settings/qq/voice-reply-mode', 'text')
  const aiGirlfriendEnabled = useLocalStorageManualReset<boolean>('settings/qq/ai-girlfriend-enabled', false)
  const memeProbability = useLocalStorageManualReset<number>('settings/qq/meme-probability', 0.2)
  const syncMemePacksAcrossModules = useLocalStorageManualReset<boolean>('settings/messaging/sync-meme-packs-across-modules', true)
  const qqEmotionMemePacks = useLocalStorageManualReset<QQEmotionMemePackConfig[]>('settings/qq/emotion-meme-packs', [])
  const wechatEmotionMemePacksShadow = useLocalStorageManualReset<QQEmotionMemePackConfig[]>('settings/wechat/emotion-meme-packs', [])
  const sharedEmotionMemePacks = useLocalStorageManualReset<QQEmotionMemePackConfig[]>('settings/messaging/shared-emotion-meme-packs', [])
  const emotionMemePacks = computed<QQEmotionMemePackConfig[]>({
    get() {
      return syncMemePacksAcrossModules.value
        ? sharedEmotionMemePacks.value
        : qqEmotionMemePacks.value
    },
    set(next) {
      if (syncMemePacksAcrossModules.value) {
        sharedEmotionMemePacks.value = normalizeEmotionMemePacks(next)
        return
      }

      qqEmotionMemePacks.value = normalizeEmotionMemePacks(next)
    },
  })
  const boundUserIds = useLocalStorageManualReset<string[]>('settings/qq/bound-user-ids', [])
  const clearingBoundUserIds = ref<boolean>(false)
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

  function addEmotionMemePack() {
    emotionMemePacks.value = [
      ...emotionMemePacks.value,
      {
        state: '',
        images: [],
      },
    ]
  }

  function removeEmotionMemePack(index: number) {
    emotionMemePacks.value = emotionMemePacks.value.filter((_, currentIndex) => currentIndex !== index)
  }

  function updateEmotionMemePackState(index: number, state: string) {
    emotionMemePacks.value = emotionMemePacks.value.map((pack, currentIndex) => {
      if (currentIndex !== index)
        return pack

      return {
        ...pack,
        state,
      }
    })
  }

  function appendEmotionMemeImages(index: number, images: QQMemeImageConfig[]) {
    if (!images.length)
      return

    emotionMemePacks.value = emotionMemePacks.value.map((pack, currentIndex) => {
      if (currentIndex !== index)
        return pack

      return {
        ...pack,
        images: [...pack.images, ...images],
      }
    })
  }

  function removeEmotionMemeImage(index: number, imageId: string) {
    emotionMemePacks.value = emotionMemePacks.value.map((pack, currentIndex) => {
      if (currentIndex !== index)
        return pack

      return {
        ...pack,
        images: pack.images.filter(image => image.id !== imageId),
      }
    })
  }

  async function clearBoundUserIdsForCurrentMethod() {
    clearingBoundUserIds.value = true
    try {
      boundUserIds.value = []
      await saveSettings()
    }
    finally {
      clearingBoundUserIds.value = false
    }
  }

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

  function buildVisionConfigPayload(): QQVisionConfigPayload {
    const providerId = activeConsciousnessProvider.value.trim()
    const model = activeConsciousnessModel.value.trim()
    const providerModels = providerId
      ? providersStore.getModelsForProvider(providerId)
      : []
    const normalizedModelId = model.toLowerCase()
    const matchedModel = providerModels.find((item) => {
      const itemId = typeof item.id === 'string' ? item.id.trim().toLowerCase() : ''
      return itemId.length > 0 && itemId === normalizedModelId
    })
    const supportsVision = model.length > 0
      ? inferModelSupportsVision(model, matchedModel?.capabilities)
      : false

    return {
      providerId: providerId || undefined,
      model: model || undefined,
      supportsImageInput: supportsVision,
      supportsVideoInput: supportsVision,
    }
  }

  async function saveSettings(skipRpcConfigPush = false) {
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
      napcatWsToken: napcatWsToken.value,
      napcatHttpApiUrl: napcatHttpApiUrl.value,
      napcatHttpApiToken: napcatHttpApiToken.value,
      napcatGroupOnlyReplyAt: napcatGroupOnlyReplyAt.value,
      voiceReplyMode: voiceReplyMode.value,
      aiGirlfriendEnabled: aiGirlfriendEnabled.value,
      memeProbability: memeProbability.value,
      emotionMemePacks: emotionMemePacks.value,
      boundUserIds: boundUserIds.value,
      tts: tts || undefined,
      vision: buildVisionConfigPayload(),
    }

    if (!skipRpcConfigPush) {
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
    }

    configurator.updateFor('qq', {
      ...configPayload,
    })
  }

  modsServerChannel.onEvent('module:status', (event) => {
    const identity = event.data.identity?.plugin?.id
    if (identity !== 'qq-bot' && identity !== 'qq')
      return

    const runtimeDetails = event.data.details
    if (runtimeDetails && typeof runtimeDetails === 'object' && !Array.isArray(runtimeDetails)) {
      const detailsRecord = runtimeDetails as Record<string, unknown>
      const detailBoundUserIds = detailsRecord.boundUserIds
      if (Array.isArray(detailBoundUserIds)) {
        const normalized = detailBoundUserIds
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.trim())
          .filter(Boolean)

        const currentBoundUserIds = new Set(boundUserIds.value)
        let changed = false
        for (const id of normalized) {
          if (!currentBoundUserIds.has(id)) {
            currentBoundUserIds.add(id)
            changed = true
          }
        }
        if (changed) {
          boundUserIds.value = Array.from(currentBoundUserIds)
          // 自动将新的绑定状态同步回服务端保存，防止重启后丢失
          void saveSettings(true)
        }
      }
    }

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
    napcatWsToken.reset()
    napcatHttpApiUrl.reset()
    napcatHttpApiToken.reset()
    napcatGroupOnlyReplyAt.reset()
    voiceReplyMode.reset()
    aiGirlfriendEnabled.reset()
    memeProbability.reset()
    qqEmotionMemePacks.reset()
    boundUserIds.reset()
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

  watch(syncMemePacksAcrossModules, (enabledSync, previousSync) => {
    if (enabledSync === previousSync)
      return

    if (enabledSync) {
      sharedEmotionMemePacks.value = mergeEmotionMemePacks([
        sharedEmotionMemePacks.value,
        qqEmotionMemePacks.value,
        wechatEmotionMemePacksShadow.value,
      ])
      return
    }

    const separatedSnapshot = normalizeEmotionMemePacks(sharedEmotionMemePacks.value)
    qqEmotionMemePacks.value = separatedSnapshot
    wechatEmotionMemePacksShadow.value = normalizeEmotionMemePacks(separatedSnapshot)
  })

  watch([activeConsciousnessProvider, activeConsciousnessModel], () => {
    if (!enabled.value)
      return

    void saveSettings(true)
  })

  return {
    enabled,
    method,
    officialAppId,
    officialAppSecret,
    napcatWsUrl,
    napcatWsToken,
    napcatHttpApiUrl,
    napcatHttpApiToken,
    napcatGroupOnlyReplyAt,
    voiceReplyMode,
    aiGirlfriendEnabled,
    memeProbability,
    syncMemePacksAcrossModules,
    emotionMemePacks,
    boundUserIds,
    clearingBoundUserIds,
    voiceGenerationStatus,
    voiceGenerationLastMessage,
    ttsConfigured,
    connectionStatus,
    connectionMessage,
    connectionError,
    runtimeLogs,
    configured,
    addEmotionMemePack,
    removeEmotionMemePack,
    updateEmotionMemePackState,
    appendEmotionMemeImages,
    removeEmotionMemeImage,
    clearBoundUserIdsForCurrentMethod,
    clearRuntimeLogs,
    initializeAutoConnect,
    saveSettings,
    resetState,
  }
})
