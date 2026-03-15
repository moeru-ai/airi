import type { WebSocketBaseEvent } from '@proj-airi/server-sdk'

import type { ContextMessage } from '../../types/chat'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface MinecraftEditableConfig {
  enabled: boolean
  host: string
  port: number
  username: string
}

type MinecraftBotState = 'connecting' | 'connected' | 'disconnected' | 'error'

interface MinecraftStatusPayload {
  serviceName?: string
  botState?: MinecraftBotState
  editableConfig?: MinecraftEditableConfig
  lastError?: string
  updatedAt?: number
}

const HEARTBEAT_TIMEOUT_MS = 20_000
const HEARTBEAT_TICK_MS = 1_000

function isMinecraftStatusPayload(value: unknown): value is MinecraftStatusPayload {
  if (!value || typeof value !== 'object')
    return false

  const payload = value as Record<string, unknown>
  if (payload.editableConfig && typeof payload.editableConfig !== 'object')
    return false

  return true
}

function equalConfig(a: MinecraftEditableConfig | null, b: MinecraftEditableConfig | null) {
  if (!a || !b)
    return false

  return a.enabled === b.enabled
    && a.host === b.host
    && a.port === b.port
    && a.username === b.username
}

export const useMinecraftStore = defineStore('minecraft', () => {
  const serverChannelStore = useModsServerChannelStore()

  const enabled = ref(false)
  const serverAddress = ref('')
  const serverPort = ref(25565)
  const username = ref('')

  const serviceName = ref('')
  const botState = ref<MinecraftBotState>('disconnected')
  const lastStatusAt = ref(0)
  const lastError = ref('')
  const applying = ref(false)
  const initialized = ref(false)
  const now = ref(Date.now())
  const remoteConfig = ref<MinecraftEditableConfig | null>(null)

  let disposeContextUpdate: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const draftConfig = computed<MinecraftEditableConfig>(() => ({
    enabled: enabled.value,
    host: serverAddress.value,
    port: serverPort.value,
    username: username.value,
  }))
  const appliedConfig = computed(() => remoteConfig.value)

  const dirty = computed(() => {
    if (!remoteConfig.value)
      return false

    return !equalConfig(draftConfig.value, remoteConfig.value)
  })

  const serviceConnected = computed(() => {
    if (!lastStatusAt.value)
      return false

    return now.value - lastStatusAt.value <= HEARTBEAT_TIMEOUT_MS
  })

  const canEdit = computed(() => serviceConnected.value && !!serviceName.value)

  const configured = computed(() => {
    return enabled.value && !!(serverAddress.value.trim() && username.value.trim() && serverPort.value > 0)
  })

  function loadRemoteConfig() {
    if (!remoteConfig.value)
      return

    enabled.value = remoteConfig.value.enabled
    serverAddress.value = remoteConfig.value.host
    serverPort.value = remoteConfig.value.port
    username.value = remoteConfig.value.username
  }

  function handleStatusUpdate(event: WebSocketBaseEvent<'context:update', ContextMessage>) {
    if (event.data.lane !== 'minecraft:status')
      return

    if (!isMinecraftStatusPayload(event.data.content))
      return

    const payload = event.data.content
    if (!payload.editableConfig)
      return

    const hadRemoteConfig = !!remoteConfig.value
    serviceName.value = payload.serviceName
      ?? event.metadata?.source?.plugin?.id
      ?? serviceName.value
      ?? 'minecraft-bot'
    botState.value = payload.botState ?? 'disconnected'
    lastStatusAt.value = typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now()
    lastError.value = payload.lastError ?? ''
    remoteConfig.value = payload.editableConfig

    if (!hadRemoteConfig || !dirty.value || applying.value) {
      loadRemoteConfig()
    }

    if (applying.value && equalConfig(remoteConfig.value, draftConfig.value)) {
      applying.value = false
    }

    if (payload.botState === 'error' && payload.lastError) {
      applying.value = false
    }
  }

  function initialize() {
    if (initialized.value)
      return

    initialized.value = true
    disposeContextUpdate = serverChannelStore.onContextUpdate(handleStatusUpdate as any)
    heartbeatTimer = setInterval(() => {
      now.value = Date.now()
    }, HEARTBEAT_TICK_MS)
  }

  function dispose() {
    disposeContextUpdate?.()
    disposeContextUpdate = null

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }

    initialized.value = false
  }

  async function saveAndApply() {
    if (!canEdit.value)
      return

    applying.value = true
    lastError.value = ''

    serverChannelStore.send({
      type: 'ui:configure',
      data: {
        moduleName: serviceName.value,
        config: {
          enabled: enabled.value,
          host: serverAddress.value,
          port: serverPort.value,
          username: username.value,
        },
      },
    })
  }

  function resetState() {
    enabled.value = false
    serverAddress.value = ''
    serverPort.value = 25565
    username.value = ''
    serviceName.value = ''
    botState.value = 'disconnected'
    lastStatusAt.value = 0
    lastError.value = ''
    applying.value = false
    remoteConfig.value = null
  }

  return {
    enabled,
    serverAddress,
    serverPort,
    username,
    serviceName,
    botState,
    lastStatusAt,
    lastError,
    applying,
    configured,
    serviceConnected,
    canEdit,
    dirty,
    appliedConfig,

    initialize,
    loadRemoteConfig,
    saveAndApply,
    dispose,
    resetState,

    _handleStatusUpdate: handleStatusUpdate,
  }
})
