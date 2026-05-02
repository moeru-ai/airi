import type {
  GatewayBootstrap,
  GatewayDiagnostics,
  GatewayWsClientMessage,
  InteractionMode,
  RealtimeInferenceCompletedPayload,
  RealtimeInferenceFailedPayload,
  RealtimeInferenceTextChunkPayload,
  SessionAccess,
  SessionContext,
  SessionRecord,
  TextMessage,
} from '@proj-airi/visual-chat-protocol'
import type { WsEvent } from '@proj-airi/visual-chat-sdk'

import { VISUAL_CHAT_GATEWAY_TOKEN_HEADER } from '@proj-airi/visual-chat-protocol'
import { GatewayClient, GatewayWsClient } from '@proj-airi/visual-chat-sdk'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import {
  createRealtimeSourceId,
  createRealtimeVideoStreamer,
  stopMediaStreamTracks,
} from './visual-chat/realtime-media'

export type VisualChatConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
export type VisualChatRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
export type VisualChatParticipantKind = 'desktop' | 'phone'

export interface VideoDevice {
  deviceId: string
  label: string
}

export interface VisualChatWorkerHealth {
  status?: string
  ok?: boolean
  backendKind?: string
  model?: string
  upstreamBaseUrl?: string
  fixedModel?: boolean
  features?: string[]
  currentCnt?: number
  metrics?: {
    totalInferences: number
    successCount: number
    failureCount: number
    avgPrefillLatencyMs: number
    avgDecodeLatencyMs: number
    avgTotalLatencyMs: number
    lastLatencyMs: number
  }
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  durationMs?: number
  timestamp: number
  model?: string
  sourceId?: string
  streaming?: boolean
}

const TRAILING_SLASH_PATTERN = /\/$/

function createDefaultParticipantIdentity(kind: VisualChatParticipantKind): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${kind}-${random}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sanitizeBaseUrl(value: string): string {
  return value.replace(TRAILING_SLASH_PATTERN, '')
}

function rewriteUrlHost(value: string, host: string): string {
  const url = new URL(value)
  url.hostname = host
  return url.toString()
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHost(new URL(value).hostname)
  }
  catch {
    return false
  }
}

function resolveRuntimeHost(): string {
  if (typeof window === 'undefined')
    return 'localhost'
  if (window.location.protocol === 'file:' || !window.location.hostname)
    return 'localhost'
  return window.location.hostname
}

function resolveRuntimeProtocol(): 'http:' | 'https:' {
  if (typeof window === 'undefined')
    return 'http:'
  return window.location.protocol === 'https:' ? 'https:' : 'http:'
}

function buildDefaultServiceUrl(port: number): string {
  return `${resolveRuntimeProtocol()}//${resolveRuntimeHost()}:${port}`
}

function isMobileReachableHost(host: string): boolean {
  return !!host && !isLoopbackHost(host)
}

function usesHashRoutes(): boolean {
  return import.meta.env.RUNTIME_ENVIRONMENT === 'electron'
}

function buildRuntimeRouteUrl(baseUrl: string, routePath: string, query: Record<string, string>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const normalized = value.trim()
    if (normalized)
      params.set(key, normalized)
  }

  const url = new URL(`${sanitizeBaseUrl(baseUrl)}/`)
  if (usesHashRoutes()) {
    const queryString = params.toString()
    url.hash = `${routePath}${queryString ? `?${queryString}` : ''}`
    return url.toString()
  }

  url.pathname = routePath
  url.search = params.toString()
  return url.toString()
}

function shouldUseRemoteHostDefaults(): boolean {
  return !isLoopbackHost(resolveRuntimeHost())
}

function buildGatewayWsUrl(baseUrl: string): string {
  const url = new URL(sanitizeBaseUrl(baseUrl))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(TRAILING_SLASH_PATTERN, '')}/ws`
  return url.toString()
}

function sleep(ms: number) {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms))
}

function mapRealtimeTextMessage(message: TextMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    timestamp: message.timestamp,
    sourceId: message.sourceId,
    model: message.model,
    streaming: false,
  }
}

export const useVisualChatStore = defineStore('visual-chat', () => {
  const enabled = useLocalStorage('visual-chat:enabled', false)
  const gatewayUrl = useLocalStorage('visual-chat:gateway-url', buildDefaultServiceUrl(6200))
  const gatewayToken = useLocalStorage('visual-chat:gateway-token', '')
  const selectedSessionId = useLocalStorage('visual-chat:selected-session-id', '')
  const selectedSessionToken = useLocalStorage('visual-chat:selected-session-token', '')
  const realtimeMode = computed<InteractionMode>(() => 'vision-text-realtime')
  const participantKind = useLocalStorage<VisualChatParticipantKind>('visual-chat:participant-kind', 'desktop')
  const participantIdentity = useLocalStorage('visual-chat:participant-identity', createDefaultParticipantIdentity('desktop'))

  const connectionStatus = ref<VisualChatConnectionStatus>('idle')
  const realtimeStatus = ref<VisualChatRealtimeStatus>('idle')
  const lastError = ref<string | null>(null)
  const loading = ref(false)
  const sessions = shallowRef<SessionContext[]>([])
  const sessionRecords = shallowRef<SessionRecord[]>([])
  const activeSession = shallowRef<SessionContext | null>(null)
  const diagnostics = shallowRef<GatewayDiagnostics | null>(null)
  const workerHealth = shallowRef<VisualChatWorkerHealth | null>(null)

  const gatewayClient = shallowRef(new GatewayClient({
    baseUrl: gatewayUrl.value,
    getGatewayToken: () => gatewayToken.value,
    getSessionAccess: () => currentSessionAccess(),
  }))
  const gatewayWsClient = shallowRef<GatewayWsClient | null>(null)
  const realtimeWsUrl = ref('')
  const isGatewayReachable = computed(() => connectionStatus.value === 'connected')
  const phoneEntryOverrideHost = useLocalStorage('visual-chat:phone-entry-override-host', '')

  const preferredLanHost = computed(() => diagnostics.value?.preferredLanAddress ?? diagnostics.value?.lanAddresses?.[0] ?? '')
  const gatewayHostname = computed(() => diagnostics.value?.hostname ?? '')
  const preferredPublicFrontendUrl = computed(() => sanitizeBaseUrl(diagnostics.value?.publicFrontendUrl ?? ''))
  const preferredPublicGatewayUrl = computed(() => sanitizeBaseUrl(diagnostics.value?.publicGatewayUrl ?? ''))

  const bestMobileReachableHost = computed(() => {
    if (phoneEntryOverrideHost.value)
      return phoneEntryOverrideHost.value

    if (isMobileReachableHost(preferredLanHost.value))
      return preferredLanHost.value

    if (gatewayHostname.value && !isLoopbackHost(gatewayHostname.value))
      return gatewayHostname.value

    return ''
  })

  const preferredServiceHost = computed(() => {
    const runtimeHost = resolveRuntimeHost()
    if (!isLoopbackHost(runtimeHost))
      return runtimeHost
    return bestMobileReachableHost.value || runtimeHost
  })
  const suggestedGatewayUrl = computed(() => {
    if (!isMobileReachableHost(preferredServiceHost.value))
      return ''
    return `${resolveRuntimeProtocol()}//${preferredServiceHost.value}:6200`
  })
  const gatewayUrlNeedsHostRewrite = computed(() => {
    return shouldUseRemoteHostDefaults() && isLoopbackUrl(gatewayUrl.value) && !!suggestedGatewayUrl.value
  })
  const phoneEntryBaseUrl = computed(() => {
    if (preferredPublicFrontendUrl.value)
      return preferredPublicFrontendUrl.value

    if (typeof window === 'undefined')
      return ''

    const runtimeOrigin = window.location.origin
    if (!isLoopbackUrl(runtimeOrigin))
      return runtimeOrigin

    const mobileHost = bestMobileReachableHost.value
    if (mobileHost)
      return rewriteUrlHost(runtimeOrigin, mobileHost)

    return ''
  })
  const phoneEntryGatewayUrl = computed(() => {
    if (preferredPublicGatewayUrl.value)
      return preferredPublicGatewayUrl.value

    const normalizedGatewayUrl = sanitizeBaseUrl(gatewayUrl.value)
    if (!normalizedGatewayUrl)
      return ''

    if (!isLoopbackUrl(normalizedGatewayUrl))
      return normalizedGatewayUrl

    const mobileHost = bestMobileReachableHost.value
    if (mobileHost)
      return `${resolveRuntimeProtocol()}//${mobileHost}:6200`

    return ''
  })
  const phoneEntryUnavailableReason = computed(() => {
    if (!selectedSessionId.value)
      return 'Available after a session is active.'
    if (!selectedSessionToken.value)
      return 'Waiting for the secure session link to be prepared.'
    if (!phoneEntryBaseUrl.value || !phoneEntryGatewayUrl.value)
      return 'No reachable address found. Set a fixed host below, or configure public HTTPS/WSS endpoints.'
    return ''
  })
  const phoneEntryUrl = computed(() => {
    if (!phoneEntryBaseUrl.value || !phoneEntryGatewayUrl.value || !selectedSessionId.value || !selectedSessionToken.value)
      return ''

    return buildRuntimeRouteUrl(phoneEntryBaseUrl.value, '/visual-chat/phone', {
      session: selectedSessionId.value,
      gateway: phoneEntryGatewayUrl.value,
      token: selectedSessionToken.value,
    })
  })

  const isReconnecting = ref(false)
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let reconnectAttempt = 0
  const MAX_RECONNECT_DELAY_MS = 30_000
  const BASE_RECONNECT_DELAY_MS = 1_000

  const chatMessages = ref<ChatMessage[]>([])
  const sessionMemorySummary = ref('')
  const inferring = ref(false)
  const autoObserving = ref(false)
  const autoObserveInferring = ref(false)
  const autoObserveIntervalMs = ref(5000)
  const autoObservePipelineStats = shallowRef<{
    totalInferences: number
    autoObserveInferences: number
    userInferences: number
    skippedAutoObserve: number
    skippedNoChange: number
    timedOut: number
    avgLatencyMs: number
    lastLatencyMs: number
    adaptiveIntervalMs: number
    baseIntervalMs: number
  } | null>(null)
  const hasFixedModel = computed(() => workerHealth.value?.fixedModel === true)
  const fixedModelName = computed(() => workerHealth.value?.model || '')

  const videoDevices = ref<VideoDevice[]>([])
  const selectedDeviceId = useLocalStorage('visual-chat:selected-device', '')
  const sourceMode = ref<'camera' | 'screen' | null>(null)
  const mediaStream = shallowRef<MediaStream | null>(null)
  const realtimeVideoStreamer = shallowRef<Awaited<ReturnType<typeof createRealtimeVideoStreamer>> | null>(null)
  const screenCaptureProvider = shallowRef<(() => Promise<MediaStream>) | null>(null)

  function currentSessionAccess() {
    if (!selectedSessionId.value || !selectedSessionToken.value)
      return null

    return {
      sessionId: selectedSessionId.value,
      sessionToken: selectedSessionToken.value,
    }
  }

  function applySessionAccess(access: SessionAccess) {
    selectedSessionId.value = access.session.sessionId
    selectedSessionToken.value = access.sessionToken
    activeSession.value = access.session
  }

  function resolveActiveVideoSourceType(): 'phone-camera' | 'laptop-camera' | 'screen-share' | null {
    if (!sourceMode.value)
      return null

    if (sourceMode.value === 'screen')
      return 'screen-share'

    return participantKind.value === 'phone' ? 'phone-camera' : 'laptop-camera'
  }

  function setScreenCaptureProvider(provider: (() => Promise<MediaStream>) | null) {
    screenCaptureProvider.value = provider
  }

  function applySuggestedNetworkUrls() {
    if (suggestedGatewayUrl.value)
      gatewayUrl.value = suggestedGatewayUrl.value
  }

  function ensureParticipantIdentityForKind(kind: VisualChatParticipantKind) {
    if (!participantIdentity.value.startsWith(`${kind}-`))
      participantIdentity.value = createDefaultParticipantIdentity(kind)
  }

  function setParticipantKind(kind: VisualChatParticipantKind) {
    participantKind.value = kind
    ensureParticipantIdentityForKind(kind)
    void restartRealtimeStreaming()
  }

  async function ensureGatewayBootstrapToken(): Promise<GatewayBootstrap | null> {
    try {
      const bootstrap = await gatewayClient.value.bootstrap()
      gatewayToken.value = bootstrap.gatewayToken
      return bootstrap
    }
    catch {
      return null
    }
  }

  function clearRuntimeState() {
    connectionStatus.value = 'idle'
    realtimeStatus.value = 'idle'
    lastError.value = null
    loading.value = false
    sessions.value = []
    sessionRecords.value = []
    activeSession.value = null
    diagnostics.value = null
    workerHealth.value = null
    selectedSessionId.value = ''
    selectedSessionToken.value = ''
    chatMessages.value = []
    sessionMemorySummary.value = ''
    inferring.value = false
    autoObserving.value = false
    autoObserveInferring.value = false
    autoObservePipelineStats.value = null
  }

  function upsertChatMessage(message: ChatMessage) {
    if (message.id) {
      const existingIndex = chatMessages.value.findIndex(item => item.id === message.id)
      if (existingIndex >= 0) {
        chatMessages.value[existingIndex] = {
          ...chatMessages.value[existingIndex],
          ...message,
        }
        return
      }
    }

    chatMessages.value.push(message)
  }

  function hydrateSessionMessages(messages: TextMessage[]) {
    chatMessages.value = messages.map(mapRealtimeTextMessage)
  }

  async function enumerateVideoDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      videoDevices.value = []
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = devices
        .filter(device => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || (device.deviceId ? `Camera ${device.deviceId.slice(0, 8)}` : `Camera ${index + 1}`),
        }))

      if (videoDevices.value.length > 0 && !selectedDeviceId.value)
        selectedDeviceId.value = videoDevices.value[0].deviceId
    }
    catch {
      videoDevices.value = []
    }
  }

  function stopRealtimeVideoStreamer() {
    realtimeVideoStreamer.value?.stop()
    realtimeVideoStreamer.value = null
  }

  function stopMediaStream() {
    stopRealtimeVideoStreamer()
    stopMediaStreamTracks(mediaStream.value)
    mediaStream.value = null
    sourceMode.value = null
  }

  async function startCamera(deviceId?: string, facingMode?: 'user' | 'environment'): Promise<MediaStream> {
    stopMediaStream()

    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera API is not available. This browser may require HTTPS for camera access.')

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    }

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId }
    }
    else if (facingMode) {
      videoConstraints.facingMode = { ideal: facingMode }
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
    })
    mediaStream.value = stream
    sourceMode.value = 'camera'
    await enumerateVideoDevices()
    await restartRealtimeStreaming()
    return stream
  }

  async function startScreenCapture(): Promise<MediaStream> {
    stopMediaStream()

    let stream: MediaStream

    if (screenCaptureProvider.value) {
      stream = await screenCaptureProvider.value()
    }
    else if (navigator.mediaDevices?.getDisplayMedia) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
    }
    else {
      throw new Error('Screen capture API is not available. This browser may require HTTPS or a secure context.')
    }

    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopMediaStream()
    })
    mediaStream.value = stream
    sourceMode.value = 'screen'
    await restartRealtimeStreaming()
    return stream
  }

  function cancelReconnect() {
    if (reconnectTimer) {
      globalThis.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempt = 0
    isReconnecting.value = false
  }

  function scheduleReconnect() {
    if (!enabled.value || reconnectTimer)
      return

    const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
    reconnectAttempt++
    isReconnecting.value = true

    reconnectTimer = globalThis.setTimeout(async () => {
      reconnectTimer = null
      try {
        await ensureGatewayWsClient()
      }
      catch {
        scheduleReconnect()
      }
    }, delay)
  }

  async function ensureGatewayWsClient() {
    const nextWsUrl = buildGatewayWsUrl(gatewayUrl.value)
    if (!gatewayWsClient.value || realtimeWsUrl.value !== nextWsUrl) {
      gatewayWsClient.value?.disconnect()

      const client = new GatewayWsClient(nextWsUrl, {
        autoReconnect: false,
        getSessionAccess: (sessionId) => {
          const sessionAccess = currentSessionAccess()
          if (!sessionAccess || sessionAccess.sessionId !== sessionId)
            return null
          return sessionAccess
        },
      })
      gatewayWsClient.value = client
      realtimeWsUrl.value = nextWsUrl

      client.on('connected', () => {
        realtimeStatus.value = 'connected'
        cancelReconnect()
        if (selectedSessionId.value) {
          client.subscribe(selectedSessionId.value)
          gatewayClient.value.getSessionMessages(selectedSessionId.value)
            .then(res => hydrateSessionMessages(res.messages))
            .catch(() => {})
        }
      })

      client.on('disconnected', () => {
        realtimeStatus.value = 'disconnected'
        scheduleReconnect()
      })

      client.on('*', (event) => {
        handleRealtimeEvent(event)
      })

      realtimeStatus.value = 'connecting'
    }

    gatewayWsClient.value.connect()
  }

  function sendRealtimeMessage(message: GatewayWsClientMessage) {
    gatewayWsClient.value?.send(message)
  }

  function handleRealtimeEvent(event: WsEvent) {
    if (selectedSessionId.value && event.sessionId && event.sessionId !== '*' && event.sessionId !== selectedSessionId.value)
      return

    if (event.event === 'session:state:changed') {
      const payload = event.data as { context?: SessionContext }
      if (payload.context)
        activeSession.value = payload.context
      return
    }

    if (event.event === 'source:registered' || event.event === 'source:unregistered') {
      void refreshActiveSession()
      return
    }

    if (event.event === 'chat:message') {
      upsertChatMessage(mapRealtimeTextMessage(event.data as TextMessage))
      void refreshSessionRecords()
      return
    }

    if (event.event === 'inference:started') {
      const payload = event.data as { auto?: boolean }
      if (payload.auto) {
        autoObserveInferring.value = true
      }
      else {
        inferring.value = true
      }
      lastError.value = null
      return
    }

    if (event.event === 'inference:text:chunk') {
      const payload = event.data as RealtimeInferenceTextChunkPayload
      if ((payload as { auto?: boolean }).auto)
        return
      inferring.value = true
      upsertChatMessage({
        id: payload.id,
        role: 'assistant',
        content: payload.text,
        timestamp: Date.now(),
        sourceId: payload.sourceId,
        model: payload.model,
        streaming: true,
      })
      return
    }

    if (event.event === 'inference:completed') {
      const payload = event.data as RealtimeInferenceCompletedPayload
      if (payload.auto) {
        autoObserveInferring.value = false
        return
      }
      inferring.value = false
      upsertChatMessage({
        ...mapRealtimeTextMessage(payload.message),
        durationMs: payload.durationMs,
      })
      return
    }

    if (event.event === 'inference:failed') {
      const payload = event.data as RealtimeInferenceFailedPayload
      autoObserveInferring.value = false
      inferring.value = false
      lastError.value = payload.error
      if (!(payload as { auto?: boolean }).auto) {
        upsertChatMessage({
          role: 'assistant',
          content: `Error: ${payload.error}`,
          timestamp: Date.now(),
        })
      }
      return
    }

    if (event.event === 'auto-observe:started') {
      const payload = event.data as { sessionId: string, intervalMs: number }
      autoObserving.value = true
      autoObserveIntervalMs.value = payload.intervalMs
      return
    }

    if (event.event === 'auto-observe:stopped') {
      autoObserving.value = false
      autoObservePipelineStats.value = null
      return
    }

    if (event.event === 'auto-observe:status') {
      const payload = event.data as {
        stats: {
          totalInferences: number
          autoObserveInferences: number
          userInferences: number
          skippedAutoObserve: number
          skippedNoChange: number
          timedOut: number
          avgLatencyMs: number
          lastLatencyMs: number
        }
        adaptiveIntervalMs: number
        baseIntervalMs: number
      }
      autoObservePipelineStats.value = {
        ...payload.stats,
        adaptiveIntervalMs: payload.adaptiveIntervalMs,
        baseIntervalMs: payload.baseIntervalMs,
      }
      return
    }

    if (event.event === 'session:memory:updated') {
      const payload = event.data as { summary?: string }
      sessionMemorySummary.value = payload.summary?.trim() || ''
      void refreshSessionRecords()
    }
  }

  async function restartRealtimeStreaming() {
    stopRealtimeVideoStreamer()

    if (!selectedSessionId.value || !mediaStream.value || !sourceMode.value)
      return

    resetSource()
    await ensureGatewayWsClient()

    if (!mediaStream.value || !sourceMode.value)
      return

    const videoSourceType = resolveActiveVideoSourceType()
    if (!videoSourceType)
      return
    const videoSourceId = createRealtimeSourceId(participantIdentity.value, videoSourceType)
    const videoCaptureProfile = sourceMode.value === 'screen'
      ? {
          intervalMs: 1200,
          maxPixels: 1_800_000,
          quality: 0.92,
          format: 'png' as const,
        }
      : {
          intervalMs: 900,
          maxPixels: 1_280 * 720,
          quality: 0.82,
          format: 'jpeg' as const,
        }
    let activatedSource = false
    const activateVideoSource = async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const context = await gatewayClient.value.switchSource(selectedSessionId.value, undefined, videoSourceType)
          activeSession.value = context
          if (context.activeVideoSource?.sourceType === videoSourceType)
            return
        }
        catch (error) {
          lastError.value = errorMessage(error)
        }

        await sleep(180)
      }
    }

    realtimeVideoStreamer.value = await createRealtimeVideoStreamer({
      stream: mediaStream.value,
      intervalMs: videoCaptureProfile.intervalMs,
      maxPixels: videoCaptureProfile.maxPixels,
      quality: videoCaptureProfile.quality,
      format: videoCaptureProfile.format,
      onFrame: (payload) => {
        sendRealtimeMessage({
          type: 'realtime:media:video',
          sessionId: selectedSessionId.value,
          participantIdentity: participantIdentity.value,
          sourceId: videoSourceId,
          sourceType: videoSourceType,
          timestamp: payload.timestamp,
          width: payload.width,
          height: payload.height,
          format: payload.format,
          data: payload.data,
        })

        if (!activatedSource) {
          activatedSource = true
          void activateVideoSource()
        }
      },
    })
  }

  async function requestWorkerResponse(path: string, init?: RequestInit): Promise<Response> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const gatewayBase = sanitizeBaseUrl(gatewayUrl.value)
    if (!gatewayBase)
      throw new Error(`Worker request cannot start because no gateway endpoint is configured for ${normalizedPath}.`)

    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()
    if (!gatewayToken.value)
      throw new Error('Worker request requires local gateway access.')

    const headers = new Headers(init?.headers)
    headers.set(VISUAL_CHAT_GATEWAY_TOKEN_HEADER, gatewayToken.value)

    const response = await fetch(`${gatewayBase}/api/worker${normalizedPath}`, {
      ...init,
      headers,
    })
    return response
  }

  async function probeConnection(): Promise<boolean> {
    if (!enabled.value) {
      clearRuntimeState()
      return false
    }

    connectionStatus.value = 'connecting'
    lastError.value = null
    try {
      const ok = await gatewayClient.value.health()
      connectionStatus.value = ok ? 'connected' : 'disconnected'
      if (!ok) {
        lastError.value = 'Gateway health check failed'
        return false
      }
      return true
    }
    catch (error) {
      connectionStatus.value = 'error'
      lastError.value = errorMessage(error)
      return false
    }
  }

  async function refreshSessions() {
    if (!enabled.value) {
      sessions.value = []
      return
    }

    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()
    if (!gatewayToken.value) {
      sessions.value = []
      return
    }

    const ok = connectionStatus.value === 'connected' || await probeConnection()
    if (!ok)
      return

    try {
      sessions.value = await gatewayClient.value.listSessions()
      lastError.value = null
    }
    catch (error) {
      lastError.value = errorMessage(error)
      connectionStatus.value = 'error'
    }
  }

  async function refreshSessionRecords() {
    if (!enabled.value) {
      sessionRecords.value = []
      return
    }

    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()

    const ok = connectionStatus.value === 'connected' || await probeConnection()
    if (!ok)
      return

    try {
      if (gatewayToken.value) {
        sessionRecords.value = await gatewayClient.value.listSessionRecords()
      }
      else if (selectedSessionId.value && selectedSessionToken.value) {
        const record = await gatewayClient.value.getSessionRecord(selectedSessionId.value)
        sessionRecords.value = record ? [record] : []
      }
      else {
        sessionRecords.value = []
      }

      if (selectedSessionId.value) {
        const activeRecord = sessionRecords.value.find(record => record.sessionId === selectedSessionId.value)
        sessionMemorySummary.value = activeRecord?.sceneMemory?.trim() || sessionMemorySummary.value
      }
    }
    catch (error) {
      lastError.value = errorMessage(error)
      connectionStatus.value = 'error'
    }
  }

  async function refreshDiagnostics() {
    if (!enabled.value) {
      diagnostics.value = null
      return
    }

    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()
    if (!gatewayToken.value) {
      diagnostics.value = null
      return
    }

    const ok = connectionStatus.value === 'connected' || await probeConnection()
    if (!ok)
      return

    try {
      diagnostics.value = await gatewayClient.value.getDiagnostics()
      connectionStatus.value = 'connected'
    }
    catch (error) {
      lastError.value = errorMessage(error)
      connectionStatus.value = 'error'
    }
  }

  async function refreshWorkerHealth() {
    if (!enabled.value) {
      workerHealth.value = null
      return
    }

    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()
    if (!gatewayToken.value) {
      workerHealth.value = null
      return
    }

    try {
      const res = await requestWorkerResponse('/health')
      if (!res.ok) {
        workerHealth.value = { ok: false, status: 'unreachable' }
        return
      }
      workerHealth.value = (await res.json()) as VisualChatWorkerHealth
    }
    catch {
      workerHealth.value = { ok: false, status: 'unreachable' }
    }
  }

  async function refreshAll() {
    if (!enabled.value) {
      clearRuntimeState()
      return
    }

    loading.value = true
    try {
      await probeConnection()
      await Promise.all([
        refreshSessions(),
        refreshSessionRecords(),
        refreshDiagnostics(),
        refreshWorkerHealth(),
      ])

      if (selectedSessionId.value && connectionStatus.value === 'connected' && !activeSession.value) {
        await joinRealtimeSession(selectedSessionId.value, selectedSessionToken.value).catch(() => {})
      }
    }
    finally {
      loading.value = false
    }
  }

  async function refreshActiveSession() {
    if (!selectedSessionId.value)
      return

    try {
      activeSession.value = await gatewayClient.value.getSession(selectedSessionId.value)
    }
    catch {
      activeSession.value = null
    }
  }

  async function joinRealtimeSession(sessionId: string, sessionToken?: string) {
    const nextSessionId = sessionId.trim()
    if (!nextSessionId)
      return

    const previousSessionId = selectedSessionId.value
    if (previousSessionId && previousSessionId !== nextSessionId) {
      gatewayWsClient.value?.unsubscribe(previousSessionId)
      chatMessages.value = []
      sessionMemorySummary.value = ''
      inferring.value = false
      autoObserveInferring.value = false
    }

    let nextAccess: SessionAccess | null = null
    const providedSessionToken = sessionToken?.trim()
    if (providedSessionToken)
      selectedSessionToken.value = providedSessionToken

    if (!providedSessionToken && (!selectedSessionToken.value || previousSessionId !== nextSessionId)) {
      if (!gatewayToken.value)
        await ensureGatewayBootstrapToken()
      if (!gatewayToken.value) {
        throw new Error('Missing secure session token. Open the session from the generated phone entry link, or restore it locally from the desktop app first.')
      }

      nextAccess = await gatewayClient.value.issueSessionAccess(nextSessionId)
        .catch(() => gatewayClient.value.restoreSessionRecord(nextSessionId))
      applySessionAccess(nextAccess)
    }

    selectedSessionId.value = nextSessionId
    if (!selectedSessionToken.value)
      throw new Error('No secure session token is available for this session.')

    await ensureGatewayWsClient()
    gatewayWsClient.value?.subscribe(nextSessionId)

    if (!nextAccess)
      activeSession.value = await gatewayClient.value.getSession(nextSessionId).catch(() => null)

    const messageResponse = await gatewayClient.value.getSessionMessages(nextSessionId).catch(() => ({ messages: [] }))
    hydrateSessionMessages(messageResponse.messages)
    await refreshSessionRecords().catch(() => {})
    const matchingRecord = sessionRecords.value.find(record => record.sessionId === nextSessionId)
    sessionMemorySummary.value = matchingRecord?.sceneMemory?.trim() || ''
    await restartRealtimeStreaming()
  }

  async function createRealtimeSession() {
    enabled.value = true
    if (!gatewayToken.value)
      await ensureGatewayBootstrapToken()
    if (!gatewayToken.value)
      throw new Error('Creating a visual chat session requires local gateway access.')

    const session = await gatewayClient.value.createSession()
    applySessionAccess(session)
    await refreshSessions()
    await refreshSessionRecords()
    await joinRealtimeSession(session.session.sessionId, session.sessionToken)
    return session.session
  }

  async function leaveRealtimeSession() {
    if (selectedSessionId.value)
      gatewayWsClient.value?.unsubscribe(selectedSessionId.value)

    selectedSessionId.value = ''
    selectedSessionToken.value = ''
    activeSession.value = null
    chatMessages.value = []
    sessionMemorySummary.value = ''
    inferring.value = false
    autoObserving.value = false
    autoObserveInferring.value = false
    autoObservePipelineStats.value = null
    stopRealtimeVideoStreamer()
  }

  async function deleteRealtimeSession() {
    if (!selectedSessionId.value)
      return

    await gatewayClient.value.deleteSession(selectedSessionId.value)
    await leaveRealtimeSession()
    await refreshSessions()
    await refreshSessionRecords()
  }

  async function deleteSessionRecord(sessionId: string) {
    await gatewayClient.value.deleteSessionRecord(sessionId)
    if (selectedSessionId.value === sessionId)
      await leaveRealtimeSession()
    await refreshSessionRecords()
  }

  function sendRealtimeText(text: string) {
    if (!selectedSessionId.value || !text.trim())
      return

    if (!gatewayWsClient.value)
      void ensureGatewayWsClient()

    sendRealtimeMessage({
      type: 'realtime:user:text',
      sessionId: selectedSessionId.value,
      participantIdentity: participantIdentity.value,
      text,
    })
  }

  function requestRealtimeInference() {
    if (!selectedSessionId.value)
      return

    sendRealtimeMessage({
      type: 'realtime:control',
      sessionId: selectedSessionId.value,
      action: 'request-inference',
    })
  }

  function startAutoObserve(intervalMs?: number) {
    if (!selectedSessionId.value)
      return

    sendRealtimeMessage({
      type: 'realtime:control',
      sessionId: selectedSessionId.value,
      action: 'start-auto-observe',
      intervalMs: intervalMs ?? autoObserveIntervalMs.value,
    })
  }

  function stopAutoObserve() {
    if (!selectedSessionId.value)
      return

    sendRealtimeMessage({
      type: 'realtime:control',
      sessionId: selectedSessionId.value,
      action: 'stop-auto-observe',
    })
  }

  function resetSource() {
    if (!selectedSessionId.value)
      return

    sendRealtimeMessage({
      type: 'realtime:control',
      sessionId: selectedSessionId.value,
      action: 'reset-source',
    })
  }

  watch(enabled, (isEnabled) => {
    if (isEnabled) {
      void refreshAll()
      return
    }

    stopMediaStream()
    cancelReconnect()
    gatewayWsClient.value?.disconnect()
    gatewayWsClient.value = null
    realtimeWsUrl.value = ''
    clearRuntimeState()
  })

  watch(gatewayUrl, (url) => {
    gatewayClient.value = new GatewayClient({
      baseUrl: url,
      getGatewayToken: () => gatewayToken.value,
      getSessionAccess: () => currentSessionAccess(),
    })
    cancelReconnect()
    gatewayWsClient.value?.disconnect()
    gatewayWsClient.value = null
    realtimeWsUrl.value = ''
    if (enabled.value)
      void refreshAll()
  }, { immediate: true })

  watch(participantKind, (kind) => {
    ensureParticipantIdentityForKind(kind)
  }, { immediate: true })

  return {
    enabled,
    gatewayUrl,
    gatewayToken,
    selectedSessionId,
    selectedSessionToken,
    realtimeMode,
    participantKind,
    participantIdentity,
    connectionStatus,
    realtimeStatus,
    lastError,
    loading,
    sessions,
    activeSession,
    sessionRecords,
    diagnostics,
    workerHealth,
    gatewayClient,
    gatewayWsClient,
    isGatewayReachable,
    suggestedGatewayUrl,
    gatewayUrlNeedsHostRewrite,
    phoneEntryOverrideHost,
    bestMobileReachableHost,
    phoneEntryUnavailableReason,
    phoneEntryUrl,
    chatMessages,
    sessionMemorySummary,
    inferring,
    autoObserving,
    autoObserveInferring,
    autoObserveIntervalMs,
    autoObservePipelineStats,
    isReconnecting,
    hasFixedModel,
    fixedModelName,
    videoDevices,
    selectedDeviceId,
    sourceMode,
    mediaStream,
    applySuggestedNetworkUrls,
    setParticipantKind,
    setScreenCaptureProvider,
    probeConnection,
    refreshSessions,
    refreshSessionRecords,
    refreshDiagnostics,
    refreshWorkerHealth,
    refreshAll,
    refreshActiveSession,
    createRealtimeSession,
    joinRealtimeSession,
    leaveRealtimeSession,
    deleteRealtimeSession,
    deleteSessionRecord,
    enumerateVideoDevices,
    startCamera,
    startScreenCapture,
    stopMediaStream,
    sendRealtimeText,
    requestRealtimeInference,
    startAutoObserve,
    stopAutoObserve,
    resetSource,
    restartRealtimeStreaming,
  }
})
