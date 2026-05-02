<script setup lang="ts">
import { ErrorContainer, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useVisualChatStore } from '@proj-airi/stage-ui/stores/modules/visual-chat'
import { Button, Input } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import CollapsibleSection from './components/CollapsibleSection.vue'

const store = useVisualChatStore()
const {
  enabled,
  gatewayUrl,
  selectedSessionId,
  selectedSessionToken,
  participantIdentity,
  connectionStatus,
  realtimeStatus,
  lastError,
  loading,
  activeSession,
  sessionRecords,
  chatMessages,
  sessionMemorySummary,
  inferring,
  autoObserving,
  autoObserveInferring,
  autoObserveIntervalMs,
  autoObservePipelineStats,
  videoDevices,
  selectedDeviceId,
  sourceMode,
  mediaStream,
  fixedModelName,
  isReconnecting,
} = storeToRefs(store)

const videoRef = ref<HTMLVideoElement | null>(null)
const chatContainerRef = ref<HTMLDivElement | null>(null)
const pageError = ref<string | null>(null)
const sessionActionError = ref<string | null>(null)
const sessionDraft = ref('')
const sessionTokenDraft = ref('')
const gatewayDraft = ref('')
const prompt = ref('')
const cameraFacingMode = ref<'user' | 'environment'>('environment')
const autoObserveInterval = ref(5000)

const HTTP_PROTOCOL_PATTERN = /^https?:$/

const hasRealtimeSession = computed(() => !!selectedSessionId.value)
const isCameraLive = computed(() => sourceMode.value === 'camera')
const savedConversationsBadge = computed(() => `${sessionRecords.value.length} saved`)
const historyTurnCount = computed(() => chatMessages.value.filter(m => m.role === 'user' || m.role === 'assistant').length)
const contextStateBadge = computed(() => `${historyTurnCount.value}/6 history`)
const phoneBrowserNeedsHttps = computed(() => {
  if (typeof window === 'undefined')
    return false
  return !window.isSecureContext && HTTP_PROTOCOL_PATTERN.test(window.location.protocol)
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readHashSearchParams(url: URL = new URL(window.location.href)): URLSearchParams {
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const queryIndex = hash.indexOf('?')
  if (queryIndex < 0)
    return new URLSearchParams()
  return new URLSearchParams(hash.slice(queryIndex + 1))
}

function usesHashRouteQuery(): boolean {
  if (typeof window === 'undefined')
    return false
  return window.location.hash.startsWith('#/')
}

function readSearchParam(name: string): string {
  if (typeof window === 'undefined')
    return ''

  const searchValue = new URLSearchParams(window.location.search).get(name)?.trim()
  if (searchValue)
    return searchValue

  return readHashSearchParams().get(name)?.trim() ?? ''
}

function writePhoneEntryQuery() {
  if (typeof window === 'undefined')
    return

  const nextUrl = new URL(window.location.href)
  const nextSessionId = sessionDraft.value.trim()
  const nextSessionToken = sessionTokenDraft.value.trim()
  const nextGatewayUrl = gatewayDraft.value.trim()

  if (usesHashRouteQuery()) {
    const hashPath = (() => {
      const hash = nextUrl.hash.startsWith('#') ? nextUrl.hash.slice(1) : nextUrl.hash
      const [pathPart] = hash.split('?')
      return pathPart || '/visual-chat/phone'
    })()
    const hashParams = readHashSearchParams(nextUrl)

    if (nextSessionId)
      hashParams.set('session', nextSessionId)
    else
      hashParams.delete('session')

    if (nextSessionToken)
      hashParams.set('token', nextSessionToken)
    else
      hashParams.delete('token')

    if (nextGatewayUrl)
      hashParams.set('gateway', nextGatewayUrl)
    else
      hashParams.delete('gateway')

    const nextHashQuery = hashParams.toString()
    nextUrl.hash = `${hashPath}${nextHashQuery ? `?${nextHashQuery}` : ''}`
    window.history.replaceState(null, '', nextUrl.toString())
    return
  }

  if (nextSessionId)
    nextUrl.searchParams.set('session', nextSessionId)
  else
    nextUrl.searchParams.delete('session')

  if (nextSessionToken)
    nextUrl.searchParams.set('token', nextSessionToken)
  else
    nextUrl.searchParams.delete('token')

  if (nextGatewayUrl)
    nextUrl.searchParams.set('gateway', nextGatewayUrl)
  else
    nextUrl.searchParams.delete('gateway')

  window.history.replaceState(null, '', nextUrl)
}

async function attachPreviewStream(stream: MediaStream | null) {
  await nextTick()

  if (!videoRef.value)
    return

  videoRef.value.srcObject = stream
  if (stream)
    await videoRef.value.play().catch(() => {})
}

async function joinRealtimeSession() {
  sessionActionError.value = null

  if (!sessionDraft.value.trim()) {
    sessionActionError.value = 'Enter a session id first.'
    return
  }

  try {
    enabled.value = true
    if (gatewayDraft.value.trim())
      gatewayUrl.value = gatewayDraft.value.trim()

    await nextTick()

    const reachable = await store.probeConnection()
    if (!reachable) {
      sessionActionError.value = `Cannot reach gateway at ${gatewayUrl.value}. Check that the gateway is running and the URL/port is correct.`
      return
    }

    await store.joinRealtimeSession(sessionDraft.value.trim(), sessionTokenDraft.value.trim() || undefined)
    sessionDraft.value = selectedSessionId.value
    sessionTokenDraft.value = selectedSessionToken.value
    gatewayDraft.value = gatewayUrl.value
    writePhoneEntryQuery()
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

async function leaveRealtimeSession() {
  sessionActionError.value = null

  try {
    await store.leaveRealtimeSession()
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

async function createRealtimeSession() {
  sessionActionError.value = null
  try {
    if (gatewayDraft.value.trim())
      gatewayUrl.value = gatewayDraft.value.trim()

    enabled.value = true
    await nextTick()

    const session = await store.createRealtimeSession()
    sessionDraft.value = session.sessionId
    sessionTokenDraft.value = selectedSessionToken.value
    writePhoneEntryQuery()
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

async function restoreConversation(sessionId: string) {
  sessionDraft.value = sessionId
  await joinRealtimeSession()
}

async function openCamera() {
  pageError.value = null

  if (!navigator.mediaDevices?.getUserMedia) {
    pageError.value = 'Camera API is not available in this browser. Try using HTTPS, or set chrome://flags/#unsafely-treat-insecure-origin-as-secure for this origin.'
    return
  }

  try {
    const deviceId = selectedDeviceId.value || undefined
    const stream = await store.startCamera(
      deviceId,
      deviceId ? undefined : cameraFacingMode.value,
    )
    await attachPreviewStream(stream)
  }
  catch (error) {
    pageError.value = errorMessage(error)
  }
}

function stopCamera() {
  store.stopMediaStream()
  if (videoRef.value)
    videoRef.value.srcObject = null
}

async function flipCamera() {
  cameraFacingMode.value = cameraFacingMode.value === 'environment' ? 'user' : 'environment'
  if (isCameraLive.value) {
    const wasAutoObserving = autoObserving.value
    const savedInterval = autoObserveInterval.value
    if (wasAutoObserving)
      store.stopAutoObserve()
    stopCamera()
    await openCamera()
    if (wasAutoObserving)
      store.startAutoObserve(savedInterval)
  }
}

function sendRealtimePrompt() {
  if (!prompt.value.trim())
    return

  store.sendRealtimeText(prompt.value.trim())
  prompt.value = ''
}

function toggleAutoObserve() {
  if (autoObserving.value) {
    store.stopAutoObserve()
  }
  else {
    store.startAutoObserve(autoObserveInterval.value)
  }
}

function updateCameraDevice(deviceId: string) {
  selectedDeviceId.value = deviceId
}

function scrollChatToBottom() {
  if (chatContainerRef.value)
    chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
}

watch(mediaStream, (stream) => {
  void attachPreviewStream(stream)
}, { immediate: true })

watch(chatMessages, () => {
  void nextTick(scrollChatToBottom)
}, { deep: true })

watch(selectedSessionId, (sessionId) => {
  if (sessionId)
    sessionDraft.value = sessionId
}, { immediate: true })

watch(selectedSessionToken, (sessionToken) => {
  if (sessionToken)
    sessionTokenDraft.value = sessionToken
}, { immediate: true })

watch(gatewayUrl, (value) => {
  gatewayDraft.value = value
}, { immediate: true })

onMounted(async () => {
  store.setParticipantKind('phone')

  gatewayDraft.value = readSearchParam('gateway') || gatewayUrl.value
  sessionDraft.value = readSearchParam('session') || selectedSessionId.value
  sessionTokenDraft.value = readSearchParam('token') || selectedSessionToken.value

  if (gatewayDraft.value)
    gatewayUrl.value = gatewayDraft.value

  enabled.value = true

  await nextTick()
  await store.probeConnection()
  await Promise.all([
    store.enumerateVideoDevices(),
    store.refreshSessionRecords(),
  ])

  if (sessionDraft.value && sessionTokenDraft.value)
    await joinRealtimeSession()
})

onBeforeUnmount(() => {
  if (autoObserving.value)
    store.stopAutoObserve()
  stopCamera()
})
</script>

<template>
  <div :class="['min-h-screen bg-[#f3efe7] text-neutral-900 dark:bg-[#121418] dark:text-neutral-100']">
    <div :class="['mx-auto max-w-5xl flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6']">
      <div :class="['overflow-hidden rounded-[28px] border border-black/8 bg-white/88 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur dark:border-white/8 dark:bg-[#1a1f26]/92']">
        <div :class="['flex flex-col gap-5 p-5 md:p-6']">
          <div :class="['flex flex-col gap-2']">
            <div :class="['text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400']">
              Visual Chat Phone
            </div>
            <div :class="['text-2xl font-semibold md:text-3xl']">
              Remote phone camera and text input
            </div>
            <p :class="['max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400']">
              This page joins one existing desktop session, streams phone camera frames, and sends text messages into the same fixed realtime pipeline.
            </p>
          </div>

          <div :class="['grid gap-3 md:grid-cols-5']">
            <div :class="['rounded-2xl bg-[#f7f4ed] p-3 dark:bg-white/5']">
              <div :class="['text-[11px] font-semibold uppercase tracking-wide text-neutral-400']">
                Gateway
              </div>
              <div :class="['mt-1 text-sm font-medium']">
                {{ connectionStatus }}
              </div>
            </div>
            <div :class="['rounded-2xl bg-[#f7f4ed] p-3 dark:bg-white/5']">
              <div :class="['text-[11px] font-semibold uppercase tracking-wide text-neutral-400']">
                Realtime
              </div>
              <div :class="['mt-1 text-sm font-medium']">
                {{ realtimeStatus }}
              </div>
            </div>
            <div :class="['rounded-2xl bg-[#f7f4ed] p-3 dark:bg-white/5']">
              <div :class="['text-[11px] font-semibold uppercase tracking-wide text-neutral-400']">
                Session
              </div>
              <div :class="['mt-1 text-sm font-medium font-mono']">
                {{ selectedSessionId || '--' }}
              </div>
            </div>
            <div :class="['rounded-2xl bg-[#f7f4ed] p-3 dark:bg-white/5']">
              <div :class="['text-[11px] font-semibold uppercase tracking-wide text-neutral-400']">
                Participant
              </div>
              <div :class="['mt-1 text-sm font-medium font-mono']">
                {{ participantIdentity }}
              </div>
            </div>
            <div :class="['rounded-2xl bg-[#f7f4ed] p-3 dark:bg-white/5']">
              <div :class="['text-[11px] font-semibold uppercase tracking-wide text-neutral-400']">
                Model
              </div>
              <div :class="['mt-1 text-sm font-medium']">
                {{ fixedModelName || '--' }}
              </div>
            </div>
          </div>

          <div
            v-if="isReconnecting"
            :class="['flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100']"
          >
            <span :class="['h-2 w-2 animate-pulse rounded-full bg-amber-500']" />
            Reconnecting to gateway...
          </div>

          <div
            v-if="phoneBrowserNeedsHttps"
            :class="['rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100']"
          >
            <div>
              <div :class="['font-semibold']">
                Non-secure context detected (HTTP)
              </div>
              <div :class="['mt-1']">
                Camera may not work over plain HTTP. If access fails, try one of:
              </div>
              <ul :class="['mt-1 list-inside list-disc']">
                <li>Serve over HTTPS (self-signed cert is fine)</li>
                <li>Chrome: set <code :class="['rounded bg-amber-200/60 px-1 text-xs dark:bg-amber-800/50']">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> for this origin</li>
                <li>Use a native webview or USB webcam mode</li>
              </ul>
              <div :class="['mt-1']">
                Text input works regardless of the secure context.
              </div>
            </div>
          </div>

          <ErrorContainer v-if="lastError" title="Visual Chat" :error="lastError" />
          <ErrorContainer v-if="pageError" title="Phone Realtime" :error="pageError" />
          <ErrorContainer v-if="sessionActionError" title="Realtime Session" :error="sessionActionError" />

          <div :class="['grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]']">
            <div :class="['flex flex-col gap-3']">
              <div :class="['rounded-[24px] bg-[#fbf8f1] p-4 dark:bg-white/4']">
                <div :class="['grid gap-3']">
                  <div :class="['flex flex-col gap-1']">
                    <label :class="['text-xs font-semibold uppercase tracking-wide text-neutral-400']">Gateway URL</label>
                    <Input v-model="gatewayDraft" placeholder="http://192.168.x.x:6200" />
                  </div>

                  <div :class="['flex flex-col gap-1']">
                    <label :class="['text-xs font-semibold uppercase tracking-wide text-neutral-400']">Session ID</label>
                    <Input v-model="sessionDraft" placeholder="Paste the realtime session id" @keydown.enter="joinRealtimeSession" />
                  </div>

                  <div :class="['flex flex-wrap gap-2']">
                    <Button @click="createRealtimeSession">
                      Create Session
                    </Button>
                    <Button variant="secondary" :disabled="!sessionDraft.trim()" @click="joinRealtimeSession">
                      Join Session
                    </Button>
                    <Button variant="secondary" :disabled="!hasRealtimeSession" @click="leaveRealtimeSession">
                      Leave
                    </Button>
                  </div>
                </div>
              </div>

              <CollapsibleSection title="Saved Conversations" :badge="savedConversationsBadge">
                <div class="mb-2 flex justify-end">
                  <Button variant="secondary" :disabled="loading" @click="store.refreshSessionRecords()">
                    Refresh
                  </Button>
                </div>

                <div v-if="sessionRecords.length === 0" class="text-sm text-neutral-500 dark:text-neutral-400">
                  No saved conversations yet.
                </div>

                <div v-else class="max-h-56 flex flex-col gap-2 overflow-y-auto pr-1">
                  <div
                    v-for="record in sessionRecords"
                    :key="record.sessionId"
                    class="group relative w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-left transition dark:border-neutral-800 hover:border-neutral-300 dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:border-neutral-700 dark:hover:bg-neutral-900/80"
                  >
                    <button type="button" class="w-full text-left" @click="restoreConversation(record.sessionId)">
                      <div class="flex items-center justify-between gap-3">
                        <div class="text-sm text-neutral-800 font-medium dark:text-neutral-100">
                          {{ record.title || 'New visual chat' }}
                        </div>
                        <div class="text-[10px] text-neutral-400 tracking-wide uppercase">
                          {{ record.messageCount }} msgs
                        </div>
                      </div>
                      <div class="mt-1 text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                        {{ record.summary || record.sceneMemory || 'No summary yet.' }}
                      </div>
                      <div class="mt-1 text-[10px] text-neutral-400 tracking-wide uppercase">
                        {{ new Date(record.updatedAt).toLocaleString() }}
                      </div>
                    </button>
                    <button
                      type="button"
                      class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 opacity-0 transition dark:bg-red-900/40 hover:bg-red-200 dark:text-red-300 group-hover:opacity-100 dark:hover:bg-red-900/60"
                      title="Delete conversation"
                      @click.stop="store.deleteSessionRecord(record.sessionId)"
                    >
                      <span class="i-solar-trash-bin-2-outline h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Context State" :badge="contextStateBadge">
                <div class="grid gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 font-semibold tracking-wide uppercase dark:bg-blue-900/40 dark:text-blue-200">
                      {{ historyTurnCount }}/6 history
                    </span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase" :class="sessionMemorySummary ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'">
                      Memory {{ sessionMemorySummary ? 'Active' : 'Empty' }}
                    </span>
                  </div>
                  <div v-if="inferring" class="text-xs text-amber-600 dark:text-amber-400">
                    Model is currently responding...
                  </div>
                </div>
              </CollapsibleSection>

              <div :class="['rounded-[24px] bg-[#fbf8f1] p-4 dark:bg-white/4']">
                <div :class="['grid gap-3']">
                  <div :class="['flex flex-col gap-1']">
                    <label :class="['text-xs font-semibold uppercase tracking-wide text-neutral-400']">Camera device</label>
                    <select
                      v-if="videoDevices.length > 0"
                      :value="selectedDeviceId"
                      :class="['border border-neutral-300 rounded-xl bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900']"
                      @change="updateCameraDevice(($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">
                        {{ device.label }}
                      </option>
                    </select>
                    <div v-else :class="['flex items-center gap-2']">
                      <button
                        type="button"
                        :class="[
                          'rounded-xl px-3 py-2 text-sm font-medium transition',
                          cameraFacingMode === 'environment'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                        ]"
                        @click="cameraFacingMode = 'environment'"
                      >
                        Back Camera
                      </button>
                      <button
                        type="button"
                        :class="[
                          'rounded-xl px-3 py-2 text-sm font-medium transition',
                          cameraFacingMode === 'user'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                        ]"
                        @click="cameraFacingMode = 'user'"
                      >
                        Front Camera
                      </button>
                    </div>
                  </div>

                  <div :class="['flex flex-wrap gap-2']">
                    <Button :disabled="isCameraLive" @click="openCamera">
                      Open Camera
                    </Button>
                    <Button variant="secondary" :disabled="!isCameraLive" @click="flipCamera">
                      Flip
                    </Button>
                    <Button variant="secondary" :disabled="!isCameraLive" @click="stopCamera">
                      Stop Camera
                    </Button>
                  </div>

                  <div :class="['relative overflow-hidden rounded-[22px] bg-black aspect-[4/5]']">
                    <video
                      v-show="isCameraLive"
                      ref="videoRef"
                      autoplay
                      muted
                      playsinline
                      :class="['h-full w-full object-cover']"
                    />
                    <div v-if="!isCameraLive" :class="['absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70']">
                      <div :class="['i-solar-camera-outline text-4xl']" />
                      <div>Open the phone camera to start continuous frame uplink.</div>
                    </div>
                    <div :class="['absolute left-3 top-3 flex flex-wrap gap-2']">
                      <span
                        v-if="isCameraLive"
                        :class="['rounded-full bg-emerald-500/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white']"
                      >
                        {{ cameraFacingMode === 'environment' ? 'Back cam' : 'Front cam' }}
                      </span>
                      <span
                        v-if="inferring"
                        :class="['rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white']"
                      >
                        Responding
                      </span>
                      <span
                        v-if="autoObserving"
                        :class="[
                          'rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white',
                          autoObserveInferring ? 'bg-violet-500/85 animate-pulse' : 'bg-violet-500/50',
                        ]"
                      >
                        {{ autoObserveInferring ? 'Updating memory' : 'Auto-observe' }}
                      </span>
                    </div>
                    <div v-if="autoObserving && autoObservePipelineStats" class="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400 tracking-wide uppercase">
                      <span>{{ autoObservePipelineStats.autoObserveInferences }} runs</span>
                      <span>{{ autoObservePipelineStats.skippedAutoObserve }} skips</span>
                      <span>avg {{ Math.round(autoObservePipelineStats.avgLatencyMs) }}ms</span>
                    </div>
                  </div>
                </div>
              </div>

              <div :class="['rounded-[24px] bg-[#fbf8f1] p-4 dark:bg-white/4']">
                <div :class="['grid gap-3']">
                  <div :class="['grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]']">
                    <Input v-model="prompt" placeholder="Type a prompt into the shared session" @keydown.enter="sendRealtimePrompt" />
                    <Button variant="secondary" :disabled="!hasRealtimeSession || !prompt.trim()" @click="sendRealtimePrompt">
                      {{ realtimeStatus === 'connected' ? 'Send' : 'Send' }}
                    </Button>
                  </div>
                  <div
                    v-if="hasRealtimeSession && realtimeStatus !== 'connected'"
                    :class="['rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200']"
                  >
                    Realtime WebSocket: {{ realtimeStatus }}. Messages will be queued and sent when the connection is established.
                  </div>

                  <div :class="['flex flex-wrap items-center gap-2']">
                    <Button
                      :disabled="!hasRealtimeSession || !isCameraLive"
                      :class="autoObserving ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''"
                      @click="toggleAutoObserve"
                    >
                      {{ autoObserving ? 'Stop Continuous' : 'Continuous Observation' }}
                    </Button>
                    <select
                      v-model.number="autoObserveInterval"
                      :disabled="autoObserving"
                      :class="['border border-neutral-300 rounded-xl bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900']"
                    >
                      <option :value="3000">
                        3s
                      </option>
                      <option :value="5000">
                        5s
                      </option>
                      <option :value="10000">
                        10s
                      </option>
                    </select>
                    <span v-if="autoObserving" :class="['inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400']">
                      <span :class="['h-2 w-2 animate-pulse rounded-full bg-emerald-500']" />
                      Every {{ autoObserveIntervalMs / 1000 }}s
                    </span>
                  </div>

                  <CollapsibleSection title="Rolling Scene Memory" :badge="sessionMemorySummary ? 'Active' : 'Empty'">
                    <div class="whitespace-pre-wrap text-sm text-neutral-600 leading-6 dark:text-neutral-300">
                      {{ sessionMemorySummary || 'The desktop session has not captured a stable scene memory yet.' }}
                    </div>
                  </CollapsibleSection>
                </div>
              </div>
            </div>

            <div :class="['min-h-0 h-[min(60vh,780px)] flex flex-col overflow-hidden rounded-[24px] bg-[#11151b] text-white']">
              <div :class="['flex items-center justify-between border-b border-white/8 px-4 py-3']">
                <div>
                  <div :class="['text-xs font-semibold uppercase tracking-[0.24em] text-white/45']">
                    Session Conversation
                  </div>
                  <div :class="['mt-1 text-sm text-white/70']">
                    {{ activeSession?.mode || 'Join a session to start' }}
                  </div>
                </div>
                <Button variant="secondary" :disabled="!hasRealtimeSession" @click="joinRealtimeSession">
                  Refresh Session
                </Button>
              </div>

              <div ref="chatContainerRef" :class="['flex-1 overflow-y-auto px-4 py-4']">
                <div v-if="chatMessages.length === 0" :class="['h-full flex items-center justify-center text-center text-sm text-white/45']">
                  Join the session from your phone, open the camera, then type to the assistant.
                </div>
                <div v-else :class="['flex flex-col gap-3']">
                  <div
                    v-for="(message, index) in chatMessages"
                    :key="message.id || index"
                    :class="[
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start',
                    ]"
                  >
                    <div
                      :class="[
                        'min-w-0 max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6',
                        message.role === 'user'
                          ? 'bg-[#d8f264] text-[#172109]'
                          : 'bg-white/10 text-white',
                      ]"
                    >
                      <MarkdownRenderer
                        v-if="message.role === 'assistant'"
                        :content="message.content"
                        class="visual-chat-md min-w-0 break-words"
                      />
                      <div v-else :class="['whitespace-pre-wrap break-words']">
                        {{ message.content }}
                      </div>
                      <div :class="['mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide opacity-60']">
                        <span>{{ message.role }}</span>
                        <span v-if="message.model">{{ message.model }}</span>
                        <span v-if="message.durationMs">{{ (message.durationMs / 1000).toFixed(1) }}s</span>
                      </div>
                    </div>
                  </div>

                  <div v-if="inferring" :class="['flex justify-start']">
                    <div :class="['rounded-2xl bg-white/8 px-3 py-2 text-sm text-white/60']">
                      Streaming response...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visual-chat-md :deep(p) {
  margin: 0.25em 0;
}

.visual-chat-md :deep(ul),
.visual-chat-md :deep(ol) {
  padding-left: 1.25em;
  margin: 0.25em 0;
}

.visual-chat-md :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin: 0.25em 0;
  background: rgba(0, 0, 0, 0.2);
}

.visual-chat-md :deep(code) {
  font-size: 0.85em;
  word-break: break-all;
}

.visual-chat-md :deep(p code) {
  background: rgba(0, 0, 0, 0.15);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

.visual-chat-md :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.2);
  padding-left: 0.75em;
  margin: 0.25em 0;
  opacity: 0.85;
}

.visual-chat-md :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.visual-chat-md :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
  margin: 0.25em 0;
}

.visual-chat-md :deep(th),
.visual-chat-md :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 0.25em 0.5em;
}
</style>

<route lang="yaml">
meta:
  layout: plain
  title: Visual Chat Phone
</route>
