import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useModsServerChannelStore } from '../mods/api/channel-server'

export interface MinecraftTrafficEntry {
  id: string
  type: 'context:update' | 'spark:command'
  summary: string
  source: string
  receivedAt: number
  payload: unknown
}

const RUNTIME_CONTEXT_TICK_MS = 1_000
const MAX_TRAFFIC_ENTRIES = 50
const DEFAULT_SERVICE_NAME = 'minecraft-bot'

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

function isMinecraftModuleIdentity(value: { name?: string, identity?: { plugin?: { id?: string } } }, serviceName?: string) {
  const knownServiceNames = new Set([DEFAULT_SERVICE_NAME, serviceName].filter(Boolean))
  return knownServiceNames.has(value.name ?? '') || knownServiceNames.has(value.identity?.plugin?.id ?? '')
}

export const useMinecraftStore = defineStore('minecraft', () => {
  const serverChannelStore = useModsServerChannelStore()

  const integrationEnabled = useLocalStorageManualReset<boolean>('settings/minecraft/integration-enabled', false)

  const serviceName = ref('')
  const latestRuntimeContextText = ref('')
  const lastRuntimeContextAt = ref(0)
  const trafficEntries = ref<MinecraftTrafficEntry[]>([])
  const initialized = ref(false)
  const now = ref(Date.now())
  const servicePresent = ref(false)
  const serviceHealthy = ref(false)

  let disposeContextUpdate: (() => void) | null = null
  let disposeSparkCommand: (() => void) | null = null
  let disposeRegistrySync: (() => void) | null = null
  let disposeRegistryHealthy: (() => void) | null = null
  let disposeRegistryUnhealthy: (() => void) | null = null
  let disposeModuleDeAnnounced: (() => void) | null = null
  let runtimeTickTimer: ReturnType<typeof setInterval> | null = null
  let trafficSequence = 0

  const serviceConnected = computed(() => servicePresent.value && serviceHealthy.value)
  const runtimeContextAgeMs = computed(() => {
    if (!lastRuntimeContextAt.value)
      return 0

    return Math.max(0, now.value - lastRuntimeContextAt.value)
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

  function handleRuntimeContextUpdate(event: WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']>) {
    if (!isMinecraftSource(event, serviceName.value))
      return

    if (event.data.lane === 'minecraft:status')
      return

    serviceName.value = event.metadata?.source?.plugin?.id
      ?? serviceName.value
      ?? DEFAULT_SERVICE_NAME
    latestRuntimeContextText.value = event.data.text ?? ''
    lastRuntimeContextAt.value = Date.now()

    pushTrafficEntry({
      type: 'context:update',
      summary: summarizeContextUpdate(event),
      source: getEventSourceLabel(event),
      receivedAt: Date.now(),
      payload: event.data,
    })
  }

  function handleRegistrySync(event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents['registry:modules:sync']>) {
    const moduleEntry = event.data.modules.find(module => isMinecraftModuleIdentity(module, serviceName.value))
    const wasPresent = servicePresent.value
    servicePresent.value = !!moduleEntry

    if (!moduleEntry) {
      serviceHealthy.value = false
      return
    }

    if (moduleEntry.name)
      serviceName.value = moduleEntry.name

    if (!wasPresent)
      serviceHealthy.value = true
  }

  function handleRegistryHealthy(event: WebSocketBaseEvent<'registry:modules:health:healthy', WebSocketEvents['registry:modules:health:healthy']>) {
    if (!isMinecraftModuleIdentity(event.data, serviceName.value))
      return

    servicePresent.value = true
    serviceHealthy.value = true
    serviceName.value = event.data.name ?? serviceName.value ?? DEFAULT_SERVICE_NAME
  }

  function handleRegistryUnhealthy(event: WebSocketBaseEvent<'registry:modules:health:unhealthy', WebSocketEvents['registry:modules:health:unhealthy']>) {
    if (!isMinecraftModuleIdentity(event.data, serviceName.value))
      return

    servicePresent.value = true
    serviceHealthy.value = false
    serviceName.value = event.data.name ?? serviceName.value ?? DEFAULT_SERVICE_NAME
  }

  function handleModuleDeAnnounced(event: WebSocketBaseEvent<'module:de-announced', WebSocketEvents['module:de-announced']>) {
    if (!isMinecraftModuleIdentity(event.data, serviceName.value))
      return

    servicePresent.value = false
    serviceHealthy.value = false
    serviceName.value = event.data.name ?? serviceName.value ?? DEFAULT_SERVICE_NAME
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
    disposeContextUpdate = serverChannelStore.onContextUpdate(handleRuntimeContextUpdate as any)
    disposeSparkCommand = serverChannelStore.onEvent('spark:command', handleSparkCommand as any)
    disposeRegistrySync = serverChannelStore.onEvent('registry:modules:sync', handleRegistrySync as any)
    disposeRegistryHealthy = serverChannelStore.onEvent('registry:modules:health:healthy', handleRegistryHealthy as any)
    disposeRegistryUnhealthy = serverChannelStore.onEvent('registry:modules:health:unhealthy', handleRegistryUnhealthy as any)
    disposeModuleDeAnnounced = serverChannelStore.onEvent('module:de-announced', handleModuleDeAnnounced as any)
    runtimeTickTimer = setInterval(() => {
      now.value = Date.now()
    }, RUNTIME_CONTEXT_TICK_MS)
  }

  function dispose() {
    disposeContextUpdate?.()
    disposeSparkCommand?.()
    disposeRegistrySync?.()
    disposeRegistryHealthy?.()
    disposeRegistryUnhealthy?.()
    disposeModuleDeAnnounced?.()
    disposeContextUpdate = null
    disposeSparkCommand = null
    disposeRegistrySync = null
    disposeRegistryHealthy = null
    disposeRegistryUnhealthy = null
    disposeModuleDeAnnounced = null

    if (runtimeTickTimer) {
      clearInterval(runtimeTickTimer)
      runtimeTickTimer = null
    }

    initialized.value = false
  }

  function clearRuntimeState() {
    serviceName.value = ''
    latestRuntimeContextText.value = ''
    lastRuntimeContextAt.value = 0
    servicePresent.value = false
    serviceHealthy.value = false
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
    latestRuntimeContextText,
    lastRuntimeContextAt,
    trafficEntries,
    configured,
    serviceConnected,
    runtimeContextAgeMs,

    initialize,
    dispose,
    resetState,

    _handleRuntimeContextUpdate: handleRuntimeContextUpdate,
  }
})
