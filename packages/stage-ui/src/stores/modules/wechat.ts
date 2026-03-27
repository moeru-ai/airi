import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'
import { prepareModuleRuntime } from '../module-runtime-bridge'
import { useProvidersStore } from '../providers'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export type WeChatVoiceReplyMode = 'text' | 'voice' | 'both'
const WECHAT_CONFIG_MODULE_NAME = 'wechat-bot'

export interface WeChatMemeImageConfig {
  id: string
  name: string
  mimeType: string
  dataBase64: string
}

export interface WeChatEmotionMemePackConfig {
  state: string
  images: WeChatMemeImageConfig[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeEmotionMemePacks(packs: unknown): WeChatEmotionMemePackConfig[] {
  if (!Array.isArray(packs))
    return []

  return packs.map((pack) => {
    const record = isRecord(pack) ? pack : {}
    const state = typeof record.state === 'string' ? record.state : ''
    const rawImages = Array.isArray(record.images) ? record.images : []
    const images = rawImages
      .map((image) => {
        if (!isRecord(image))
          return null
        if (typeof image.id !== 'string' || typeof image.name !== 'string' || typeof image.mimeType !== 'string' || typeof image.dataBase64 !== 'string')
          return null
        return { id: image.id, name: image.name, mimeType: image.mimeType, dataBase64: image.dataBase64 }
      })
      .filter((value): value is WeChatMemeImageConfig => value !== null)
    return { state, images }
  })
}

function mergeEmotionMemePacks(sources: WeChatEmotionMemePackConfig[][]): WeChatEmotionMemePackConfig[] {
  const mergedByState = new Map<string, WeChatEmotionMemePackConfig>()
  let unnamedIndex = 0

  for (const source of sources) {
    for (const pack of normalizeEmotionMemePacks(source)) {
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

interface WeChatTtsConfigPayload {
  providerId: string
  providerConfig?: Record<string, unknown>
  model: string
  voice: string
  outputFormat?: 'mp3' | 'wav' | 'flac' | 'silk'
  speed?: number
  pitch?: number
}

interface WeChatVisionConfigPayload {
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

export const useWeChatStore = defineStore('wechat', () => {
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

  const enabled = useLocalStorageManualReset<boolean>('settings/wechat/enabled', false)
  const voiceReplyMode = useLocalStorageManualReset<WeChatVoiceReplyMode>('settings/wechat/voice-reply-mode', 'text')
  const aiGirlfriendEnabled = useLocalStorageManualReset<boolean>('settings/wechat/ai-girlfriend-enabled', false)
  const memeProbability = useLocalStorageManualReset<number>('settings/wechat/meme-probability', 0.2)
  const syncMemePacksAcrossModules = useLocalStorageManualReset<boolean>('settings/messaging/sync-meme-packs-across-modules', true)
  const wechatEmotionMemePacks = useLocalStorageManualReset<WeChatEmotionMemePackConfig[]>('settings/wechat/emotion-meme-packs', [])
  const qqEmotionMemePacksShadow = useLocalStorageManualReset<WeChatEmotionMemePackConfig[]>('settings/qq/emotion-meme-packs', [])
  const sharedEmotionMemePacks = useLocalStorageManualReset<WeChatEmotionMemePackConfig[]>('settings/messaging/shared-emotion-meme-packs', [])
  const emotionMemePacks = computed<WeChatEmotionMemePackConfig[]>({
    get() {
      return syncMemePacksAcrossModules.value
        ? sharedEmotionMemePacks.value
        : wechatEmotionMemePacks.value
    },
    set(next) {
      if (syncMemePacksAcrossModules.value) {
        sharedEmotionMemePacks.value = normalizeEmotionMemePacks(next)
        return
      }

      wechatEmotionMemePacks.value = normalizeEmotionMemePacks(next)
    },
  })
  const mainUserId = useLocalStorageManualReset<string>('settings/wechat/main-user-id', '')
  const qrcodeUrl = ref<string>('')
  const connectionStatus = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const connectionMessage = ref('')
  const connectionError = ref('')
  const runtimeLogs = ref<{ id: number, level: string, message: string }[]>([])

  function appendRuntimeLog(level: string, message: string) {
    runtimeLogs.value.push({ id: Date.now(), level, message })
    if (runtimeLogs.value.length > 200) {
      runtimeLogs.value.shift()
    }
  }

  const ttsConfigured = computed(() => {
    return speechConfigured.value
      && activeSpeechProvider.value.trim() !== ''
      && activeSpeechProvider.value !== 'speech-noop'
      && activeSpeechModel.value.trim() !== ''
      && activeSpeechVoiceId.value.trim() !== ''
  })

  const configured = computed(() => {
    return enabled.value && connectionStatus.value === 'connected'
  })

  function buildTtsConfigPayload(): WeChatTtsConfigPayload | null {
    const providerId = activeSpeechProvider.value
    const providerConfig = providersStore.getProviderConfig(providerId) ?? {}
    const model = activeSpeechModel.value
    const voice = activeSpeechVoiceId.value
    const outputFormat: WeChatTtsConfigPayload['outputFormat'] = 'wav'

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

  function buildVisionConfigPayload(): WeChatVisionConfigPayload {
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

  function buildConfigPayload() {
    const normalizedMainUserId = mainUserId.value.trim()
    const finalVoiceReplyMode = voiceReplyMode.value
    const wantsVoice = finalVoiceReplyMode !== 'text'
    const tts = wantsVoice && ttsConfigured.value
      ? buildTtsConfigPayload()
      : null

    return {
      enabled: enabled.value,
      voiceReplyMode: finalVoiceReplyMode,
      aiGirlfriendEnabled: aiGirlfriendEnabled.value,
      memeProbability: memeProbability.value,
      emotionMemePacks: emotionMemePacks.value,
      mainUserId: normalizedMainUserId || undefined,
      boundUserIds: normalizedMainUserId ? [normalizedMainUserId] : [],
      tts: tts || undefined,
      vision: buildVisionConfigPayload(),
    }
  }

  // 我们把原有的 watch 删除，使用 saveSettings 统一处理
  // watch(
  //   () => [
  //     enabled.value,
  //     voiceReplyMode.value,
  //     aiGirlfriendEnabled.value,
  //     memeProbability.value,
  //     emotionMemePacks.value,
  //     mainUserId.value,
  //     ttsConfigured.value,
  //     activeSpeechProvider.value,
  //     activeSpeechModel.value,
  //     activeSpeechVoiceId.value,
  //     speechRate.value,
  //     speechPitch.value,
  //     activeConsciousnessProvider.value,
  //     activeConsciousnessModel.value,
  //   ],
  //   () => {
  //     console.info('[wechat] config changed, syncing to server...')
  //     const payload = buildConfigPayload()
  //
  //     // 强制推送给 server
  //     try {
  //       // @ts-expect-error client type
  //       modsServerChannel.client?.send({
  //         type: 'module:configure',
  //         data: {
  //           module: 'wechat',
  //           config: payload,
  //         },
  //       })
  //       console.info('[wechat] sent configure event to server (watch):', payload)
  //     } catch (err) {
  //       console.error('[wechat] failed to send configure event:', err)
  //     }
  //   },
  //   { deep: true, immediate: true } // 立即执行一次
  // )

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

  function appendEmotionMemeImages(index: number, images: WeChatMemeImageConfig[]) {
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

  async function saveSettings(skipRuntimePrepare = false) {
    const configPayload = buildConfigPayload()

    if (!enabled.value) {
      connectionStatus.value = 'idle'
      connectionMessage.value = ''
      connectionError.value = ''
      qrcodeUrl.value = ''

      configurator.updateFor(WECHAT_CONFIG_MODULE_NAME, configPayload)
      return
    }

    if (!skipRuntimePrepare) {
      connectionStatus.value = 'connecting'
      connectionMessage.value = '正在启动微信服务...'
      connectionError.value = ''
      qrcodeUrl.value = ''

      try {
        const runtimePrepared = await prepareModuleRuntime({
          moduleName: 'wechat',
          config: configPayload,
        })

        if (runtimePrepared?.websocketUrl) {
          modsServerChannel.websocketUrl = runtimePrepared.websocketUrl
        }

        if (runtimePrepared?.ready) {
          connectionStatus.value = 'connected'
          connectionMessage.value = '微信已连接'
          connectionError.value = ''
          qrcodeUrl.value = ''
        }
        else if (runtimePrepared?.error) {
          connectionStatus.value = 'error'
          connectionError.value = runtimePrepared.error
          appendRuntimeLog('error', runtimePrepared.error)
        }
      }
      catch (error) {
        connectionStatus.value = 'error'
        connectionError.value = error instanceof Error ? error.message : String(error)
      }
    }

    configurator.updateFor(WECHAT_CONFIG_MODULE_NAME, configPayload)
  }

  modsServerChannel.onEvent('module:status', (event) => {
    const identity = event.data.identity?.plugin?.id
    if (identity !== 'wechat-bot' && identity !== 'wechat')
      return

    const phase = event.data.phase
    const details = event.data.details as Record<string, unknown> | undefined
    const runtimeMainUserId = typeof details?.mainUserId === 'string'
      ? details.mainUserId.trim()
      : typeof details?.userId === 'string'
        ? details.userId.trim()
        : ''

    if (runtimeMainUserId && runtimeMainUserId !== mainUserId.value) {
      mainUserId.value = runtimeMainUserId
    }

    if (phase === 'configuration-needed' || phase === 'preparing') {
      connectionStatus.value = 'connecting'
      connectionMessage.value = String(details?.message || '正在连接微信...')
      connectionError.value = ''
    }
    else if (phase === 'configured' || phase === 'announced' || phase === 'prepared') {
      if (details?.qrcode && typeof details.qrcode === 'string') {
        qrcodeUrl.value = details.qrcode
        connectionStatus.value = 'connecting'
        connectionMessage.value = String(details.message || '请扫码登录')
      }
      else if (details?.message && typeof details.message === 'string') {
        connectionStatus.value = 'connecting'
        connectionMessage.value = details.message
      }
    }
    else if (phase === 'ready') {
      connectionStatus.value = 'connected'
      connectionMessage.value = String(details?.message || '微信已连接')
      qrcodeUrl.value = ''
    }
    else if (phase === 'failed') {
      connectionStatus.value = 'error'
      connectionError.value = String(details?.error || '连接失败')
      qrcodeUrl.value = ''
    }
  })

  function clearRuntimeLogs() {
    runtimeLogs.value = []
  }

  async function initializeAutoConnect() {
    if (enabled.value) {
      await saveSettings()
    }
  }

  function resetState() {
    enabled.reset()
    voiceReplyMode.reset()
    aiGirlfriendEnabled.reset()
    memeProbability.reset()
    wechatEmotionMemePacks.reset()
    mainUserId.reset()
    void saveSettings()
  }

  watch(enabled, (isEnabled, wasEnabled) => {
    if (isEnabled !== wasEnabled) {
      void saveSettings()
    }
  })

  watch([voiceReplyMode, aiGirlfriendEnabled, memeProbability, emotionMemePacks, mainUserId], () => {
    // 只要开启了，配置改变就直接保存和同步
    if (!enabled.value)
      return
    void saveSettings(true)
  }, { deep: true, immediate: true })

  watch(syncMemePacksAcrossModules, (enabledSync, previousSync) => {
    if (enabledSync === previousSync)
      return

    if (enabledSync) {
      sharedEmotionMemePacks.value = mergeEmotionMemePacks([
        sharedEmotionMemePacks.value,
        wechatEmotionMemePacks.value,
        qqEmotionMemePacksShadow.value,
      ])
    }
    else {
      const separatedSnapshot = normalizeEmotionMemePacks(sharedEmotionMemePacks.value)
      wechatEmotionMemePacks.value = separatedSnapshot
      qqEmotionMemePacksShadow.value = normalizeEmotionMemePacks(separatedSnapshot)
    }

    if (enabled.value) {
      void saveSettings(true)
    }
  })

  watch([activeConsciousnessProvider, activeConsciousnessModel], () => {
    if (!enabled.value)
      return

    void saveSettings(true)
  }, { deep: true, immediate: true })

  // 监听 TTS 相关配置，一旦改变立刻保存同步
  watch([ttsConfigured, activeSpeechProvider, activeSpeechModel, activeSpeechVoiceId, speechRate, speechPitch], () => {
    if (!enabled.value)
      return
    void saveSettings(true)
  }, { deep: true, immediate: true })

  return {
    enabled,
    configured,
    voiceReplyMode,
    aiGirlfriendEnabled,
    memeProbability,
    syncMemePacksAcrossModules,
    emotionMemePacks,
    mainUserId,
    ttsConfigured,
    qrcodeUrl,
    connectionStatus,
    connectionMessage,
    connectionError,
    runtimeLogs,
    addEmotionMemePack,
    removeEmotionMemePack,
    updateEmotionMemePackState,
    appendEmotionMemeImages,
    removeEmotionMemeImage,
    clearRuntimeLogs,
    initializeAutoConnect,
    saveSettings,
    resetState,
  }
})
