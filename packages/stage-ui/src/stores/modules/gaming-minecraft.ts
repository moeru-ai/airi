import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
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

export interface MinecraftStatusPayload {
  serviceName?: string
  botState?: MinecraftBotState
  editableConfig?: MinecraftEditableConfig
  host?: string
  port?: number
  botUsername?: string
  lastError?: string
  updatedAt?: number
}

export interface MinecraftTrafficEntry {
  id: string
  type: 'context:update' | 'spark:command'
  summary: string
  source: string
  receivedAt: number
  payload: unknown
}

const HEARTBEAT_TIMEOUT_MS = 20_000
const HEARTBEAT_TICK_MS = 1_000
const MAX_TRAFFIC_ENTRIES = 50
const DEFAULT_SERVICE_NAME = 'minecraft-bot'

function isMinecraftStatusPayload(value: unknown): value is MinecraftStatusPayload {
  return !!value && typeof value === 'object'
}

function getEventSourceLabel(event: { metadata?: { source?: { plugin?: { id?: string }, id?: string } } }) {
  return event.metadata?.source?.plugin?.id
    ?? event.metadata?.source?.id
    ?? 'unknown'
}

function isMinecraftSource(event: { metadata?: { source?: { plugin?: { id?: string }, id?: string } } }, serviceName?: string) {
  const sourcePluginId = event.metadata?.source?.plugin?.id
  const sourceId = event.metadata?.source?.id
  const knownServiceNames = [DEFAULT_SERVICE_NAME, serviceName].filter(Boolean)

  return knownServiceNames.some(name => name === sourcePluginId || name === sourceId)
}

function summarizeContextUpdate(event: WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']>) {
  const lane = event.data.lane ?? 'general'
  const text = typeof event.data.text === 'string' ? event.data.text.trim() : ''
  const preview = text ? `: ${text.slice(0, 120)}` : ''
  return `${lane}${preview}`
}

function summarizeSparkCommand(event: WebSocketBaseEvent<'spark:command', WebSocketEvents['spark:command']>) {
  const destinations = Array.isArray(event.data.destinations) && event.data.destinations.length > 0
    ? event.data.destinations.join(', ')
    : 'broadcast'

  return `${event.data.intent} -> ${destinations}`
}

export const useMinecraftStore = defineStore('minecraft', () => {
  const serverChannelStore = useModsServerChannelStore()

  const integrationEnabled = useLocalStorageManualReset<boolean>('settings/minecraft/integration-enabled', false)

  const serviceName = ref('')
  const botState = ref<MinecraftBotState>('disconnected')
  const lastStatusAt = ref(0)
  const lastError = ref('')
  const statusSnapshot = ref<MinecraftStatusPayload | null>(null)
  const trafficEntries = ref<MinecraftTrafficEntry[]>([])
  const initialized = ref(false)
  const now = ref(Date.now())

  let disposeContextUpdate: (() => void) | null = null
  let disposeSparkCommand: (() => void) | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let trafficSequence = 0

  const serviceConnected = computed(() => {
    if (!lastStatusAt.value)
      return false

    return now.value - lastStatusAt.value <= HEARTBEAT_TIMEOUT_MS
  })

  const heartbeatAgeMs = computed(() => {
    if (!lastStatusAt.value)
      return 0

    return Math.max(0, now.value - lastStatusAt.value)
  })

  const configured = computed(() => integrationEnabled.value)

  function pushTrafficEntry(entry: Omit<MinecraftTrafficEntry, 'id'>) {
    trafficSequence += 1
    trafficEntries.value.push({
      id: String(trafficSequence),
      ...entry,
    })

    if (trafficEntries.value.length > MAX_TRAFFIC_ENTRIES) {
      trafficEntries.value.splice(0, trafficEntries.value.length - MAX_TRAFFIC_ENTRIES)
    }
  }

  function handleStatusUpdate(event: WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']>) {
    if (event.data.lane !== 'minecraft:status')
      return

    if (!isMinecraftStatusPayload(event.data.content))
      return

    const payload = event.data.content as MinecraftStatusPayload
    serviceName.value = payload.serviceName
      ?? event.metadata?.source?.plugin?.id
      ?? serviceName.value
      ?? DEFAULT_SERVICE_NAME
    botState.value = payload.botState ?? 'disconnected'
    lastStatusAt.value = typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now()
    lastError.value = payload.lastError ?? ''
    statusSnapshot.value = payload
  }

  function handleContextUpdate(event: WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']>) {
    handleStatusUpdate(event)

    const lane = event.data.lane ?? 'general'
    const isMinecraftTraffic = lane === 'minecraft:status'
      || (lane === 'game' && isMinecraftSource(event, serviceName.value))

    if (!isMinecraftTraffic)
      return

    pushTrafficEntry({
      type: 'context:update',
      summary: summarizeContextUpdate(event),
      source: getEventSourceLabel(event),
      receivedAt: Date.now(),
      payload: event.data,
    })
  }

  function handleSparkCommand(event: WebSocketBaseEvent<'spark:command', WebSocketEvents['spark:command']>) {
    const destinations = Array.isArray(event.data.destinations) ? event.data.destinations : []
    const knownServiceNames = new Set([DEFAULT_SERVICE_NAME, serviceName.value].filter(Boolean))
    const isMinecraftTraffic = destinations.some(destination => knownServiceNames.has(destination))

    if (!isMinecraftTraffic)
      return

    pushTrafficEntry({
      type: 'spark:command',
      summary: summarizeSparkCommand(event),
      source: getEventSourceLabel(event),
      receivedAt: Date.now(),
      payload: event.data,
    })
  }

  function initialize() {
    if (initialized.value)
      return

    initialized.value = true
    disposeContextUpdate = serverChannelStore.onContextUpdate(handleContextUpdate as any)
    disposeSparkCommand = serverChannelStore.onEvent('spark:command', handleSparkCommand as any)
    heartbeatTimer = setInterval(() => {
      now.value = Date.now()
    }, HEARTBEAT_TICK_MS)
  }

  function dispose() {
    disposeContextUpdate?.()
    disposeSparkCommand?.()
    disposeContextUpdate = null
    disposeSparkCommand = null

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }

    initialized.value = false
  }

  function clearRuntimeState() {
    serviceName.value = ''
    botState.value = 'disconnected'
    lastStatusAt.value = 0
    lastError.value = ''
    statusSnapshot.value = null
    trafficEntries.value = []
    trafficSequence = 0
  }

  function resetState() {
    integrationEnabled.reset()
    clearRuntimeState()
  }

  return {
    integrationEnabled,
    serviceName,
    botState,
    lastStatusAt,
    lastError,
    statusSnapshot,
    trafficEntries,
    configured,
    serviceConnected,
    heartbeatAgeMs,

    initialize,
    dispose,
    resetState,

    _handleStatusUpdate: handleStatusUpdate,
  }
})
