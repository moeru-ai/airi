<script setup lang="ts">
import type { VisualChatDesktopSetupStatus } from '@proj-airi/visual-chat-shared/electron'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { ErrorContainer, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useVisualChatStore } from '@proj-airi/stage-ui/stores/modules/visual-chat'
import { Button, FieldCheckbox, Input } from '@proj-airi/ui'
import { electronVisualChatGetSetupStatus, electronVisualChatRunSetup } from '@proj-airi/visual-chat-shared/electron'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import CollapsibleSection from '../../visual-chat/components/CollapsibleSection.vue'

const store = useVisualChatStore()
const {
  enabled,
  gatewayUrl,
  selectedSessionId,
  participantIdentity,
  connectionStatus,
  realtimeStatus,
  lastError,
  loading,
  activeSession,
  sessionRecords,
  workerHealth,
  chatMessages,
  sessionMemorySummary,
  inferring,
  hasFixedModel,
  fixedModelName,
  videoDevices,
  selectedDeviceId,
  sourceMode,
  mediaStream,
  suggestedGatewayUrl,
  gatewayUrlNeedsHostRewrite,
  phoneEntryOverrideHost,
  bestMobileReachableHost,
  phoneEntryUnavailableReason,
  phoneEntryUrl,
  participantKind,
  autoObserving,
  autoObserveInferring,
  autoObserveIntervalMs,
  autoObservePipelineStats,
  isReconnecting,
} = storeToRefs(store)

const videoRef = ref<HTMLVideoElement | null>(null)
const chatContainerRef = ref<HTMLDivElement | null>(null)
const sourceError = ref<string | null>(null)
const sessionActionError = ref<string | null>(null)
const joinSessionId = ref('')
const realtimePrompt = ref('')
const signalAccessPreset = ref<'phone-remote' | 'desktop-camera-mic' | 'desktop-screen-mic'>('desktop-camera-mic')
const autoObserveInterval = ref(5000)
const desktopSetupStatus = ref<VisualChatDesktopSetupStatus | null>(null)
const desktopSetupError = ref<string | null>(null)
let desktopSetupPollTimer: ReturnType<typeof globalThis.setInterval> | null = null

const HTTP_PROTOCOL_PATTERN = /^https?:$/

interface ElectronRendererRuntime {
  electron?: {
    ipcRenderer?: Parameters<typeof createContext>[0]
  }
}

const phoneBrowserNeedsHttps = computed(() => {
  if (typeof window === 'undefined')
    return false
  return !window.isSecureContext && HTTP_PROTOCOL_PATTERN.test(window.location.protocol)
})

const modelReady = computed(() => enabled.value && workerHealth.value?.status === 'running')
const isStreaming = computed(() => sourceMode.value !== null)
const hasRealtimeSession = computed(() => !!selectedSessionId.value)
function getElectronIpcRenderer(): Parameters<typeof createContext>[0] | null {
  if (typeof window === 'undefined')
    return null

  return (window as Window & ElectronRendererRuntime).electron?.ipcRenderer ?? null
}

const hasElectronRuntime = computed(() => {
  return !!getElectronIpcRenderer()
})
const isPhoneMode = computed(() => signalAccessPreset.value === 'phone-remote')
const isDesktopCameraMode = computed(() => signalAccessPreset.value === 'desktop-camera-mic')
const isDesktopScreenMode = computed(() => signalAccessPreset.value === 'desktop-screen-mic')
const signalAccessDescription = computed(() => {
  switch (signalAccessPreset.value) {
    case 'phone-remote':
      return 'Create or reuse one session, then open the phone URL so the mobile browser can provide camera and text input remotely.'
    case 'desktop-screen-mic':
      return 'Use desktop screen capture for the visual input source.'
    default:
      return 'Use desktop camera for the visual input source.'
  }
})
const currentSessionRecord = computed(() => {
  const preferredSessionId = selectedSessionId.value || joinSessionId.value
  if (preferredSessionId) {
    const matchingRecord = sessionRecords.value.find(record => record.sessionId === preferredSessionId)
    if (matchingRecord)
      return matchingRecord
  }

  return sessionRecords.value[0] ?? null
})
const currentMemoryTimeline = computed(() => {
  return [...(currentSessionRecord.value?.memoryTimeline ?? [])]
    .sort((left, right) => right.updatedAt - left.updatedAt)
})
const desktopSetupBadge = computed(() => desktopSetupStatus.value?.state || 'checking')
const sessionBadge = computed(() => selectedSessionId.value || 'none')
const savedConversationsBadge = computed(() => `${sessionRecords.value.length} saved`)
const inputModeBadge = computed(() => {
  switch (signalAccessPreset.value) {
    case 'phone-remote': return 'Phone'
    case 'desktop-screen-mic': return 'Screen'
    default: return 'Camera'
  }
})
const rollingMemoryBadge = computed(() => sessionMemorySummary.value ? 'Active' : 'Empty')
const visibleHistoryTurnCount = computed(() => {
  return chatMessages.value.filter(m => m.role === 'user' || m.role === 'assistant').length
})
const contextStateBadge = computed(() => `${visibleHistoryTurnCount.value}/6 history`)
const historyWindowPreview = computed(() => {
  const relevant = chatMessages.value
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-6)
  return relevant.map((m) => {
    const truncated = m.content.length > 80 ? `${m.content.slice(0, 77)}...` : m.content
    return { role: m.role, preview: truncated.replace(/\n/g, ' ') }
  })
})
const setupChecklist = computed(() => {
  return [
    ...(hasElectronRuntime.value && desktopSetupStatus.value
      ? [{
          label: 'Desktop setup pipeline',
          done: desktopSetupStatus.value.state === 'ready',
          detail: desktopSetupStatus.value.error || `State: ${desktopSetupStatus.value.state}`,
        }]
      : []),
    {
      label: 'Gateway reachable',
      done: connectionStatus.value === 'connected',
      detail: connectionStatus.value === 'connected' ? gatewayUrl.value : 'Click Refresh Status and make sure the gateway is running.',
    },
    {
      label: 'Fixed model ready',
      done: modelReady.value,
      detail: modelReady.value ? (fixedModelName.value || 'Ready') : 'Worker is not ready yet.',
    },
    {
      label: 'Session active',
      done: hasRealtimeSession.value,
      detail: hasRealtimeSession.value ? selectedSessionId.value : 'Create or restore one conversation session.',
    },
    {
      label: 'Input source live',
      done: isPhoneMode.value ? !!phoneEntryUrl.value : isStreaming.value,
      detail: isPhoneMode.value
        ? (phoneEntryUrl.value || phoneEntryUnavailableReason.value || 'Phone URL is not ready yet.')
        : (isStreaming.value ? (sourceMode.value === 'screen' ? 'Screen stream is live.' : 'Camera stream is live.') : 'Apply one input mode and open the selected source.'),
    },
    {
      label: 'Phone remote entry',
      done: isPhoneMode.value ? !!phoneEntryUrl.value : true,
      detail: isPhoneMode.value
        ? (phoneEntryUrl.value || phoneEntryUnavailableReason.value || 'Waiting for a phone-ready URL.')
        : 'Not needed for the current desktop input mode.',
    },
  ]
})
const setupChecklistBadge = computed(() => {
  const items = setupChecklist.value
  const done = items.filter(i => i.done).length
  return `${done}/${items.length} ready`
})

function getDesktopSetupInvokers() {
  const ipcRenderer = getElectronIpcRenderer()
  if (!ipcRenderer)
    return null

  const context = createContext(ipcRenderer).context
  return {
    getStatus: defineInvoke(context, electronVisualChatGetSetupStatus),
    runSetup: defineInvoke(context, electronVisualChatRunSetup),
  }
}

function startDesktopSetupPolling() {
  if (desktopSetupPollTimer)
    return

  desktopSetupPollTimer = globalThis.setInterval(() => {
    void refreshDesktopSetupStatus()
  }, 1500)
}

function stopDesktopSetupPolling() {
  if (!desktopSetupPollTimer)
    return

  globalThis.clearInterval(desktopSetupPollTimer)
  desktopSetupPollTimer = null
}

async function refreshDesktopSetupStatus() {
  const invokers = getDesktopSetupInvokers()
  if (!invokers)
    return

  try {
    desktopSetupStatus.value = await invokers.getStatus()
    desktopSetupError.value = null

    if (desktopSetupStatus.value.state === 'ready') {
      stopDesktopSetupPolling()
      enabled.value = true
      await store.refreshAll()
      await store.refreshSessionRecords()
      return
    }

    if (desktopSetupStatus.value.state === 'error' || desktopSetupStatus.value.state === 'idle')
      stopDesktopSetupPolling()
  }
  catch (error) {
    desktopSetupError.value = errorMessage(error)
  }
}

async function runDesktopSetup(auto: boolean = false) {
  const invokers = getDesktopSetupInvokers()
  if (!invokers)
    return

  try {
    desktopSetupError.value = null
    startDesktopSetupPolling()
    desktopSetupStatus.value = await invokers.runSetup({ auto })
    await refreshDesktopSetupStatus()
  }
  catch (error) {
    desktopSetupError.value = errorMessage(error)
    stopDesktopSetupPolling()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function attachPreviewStream(stream: MediaStream | null) {
  await nextTick()
  if (!videoRef.value)
    return

  videoRef.value.srcObject = stream
  if (stream)
    await videoRef.value.play().catch(() => {})
}

async function openCamera() {
  sourceError.value = null
  if (phoneBrowserNeedsHttps.value) {
    sourceError.value = 'Camera capture is blocked in insecure browser contexts. Use HTTPS, the mobile app/webview, or USB webcam mode.'
    return
  }

  try {
    await ensureRealtimeSession()
    const stream = await store.startCamera(selectedDeviceId.value || undefined)
    await attachPreviewStream(stream)
  }
  catch (error) {
    sourceError.value = errorMessage(error)
  }
}

async function openScreen() {
  sourceError.value = null
  try {
    await ensureRealtimeSession()
    const stream = await store.startScreenCapture()
    await attachPreviewStream(stream)
  }
  catch (error) {
    sourceError.value = errorMessage(error)
  }
}

async function ensureRealtimeSession() {
  enabled.value = true
  if (!hasRealtimeSession.value) {
    const session = await store.createRealtimeSession()
    joinSessionId.value = session.sessionId
    return
  }

  joinSessionId.value = selectedSessionId.value
}

async function applySignalAccessPreset() {
  sessionActionError.value = null
  sourceError.value = null

  const wasAutoObserving = autoObserving.value
  const savedInterval = autoObserveInterval.value

  try {
    await ensureRealtimeSession()

    if (wasAutoObserving)
      store.stopAutoObserve()

    if (signalAccessPreset.value === 'phone-remote') {
      store.setParticipantKind('phone')
      stopSource()
      if (wasAutoObserving)
        store.startAutoObserve(savedInterval)
      return
    }

    store.setParticipantKind('desktop')

    if (signalAccessPreset.value === 'desktop-screen-mic') {
      await openScreen()
    }
    else {
      await openCamera()
    }

    if (wasAutoObserving)
      store.startAutoObserve(savedInterval)
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

function stopSource() {
  store.stopMediaStream()
  if (videoRef.value)
    videoRef.value.srcObject = null
}

async function createRealtimeSession() {
  sessionActionError.value = null
  try {
    const session = await store.createRealtimeSession()
    joinSessionId.value = session.sessionId
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

async function joinRealtimeSession() {
  sessionActionError.value = null
  if (!joinSessionId.value.trim())
    return

  try {
    await store.joinRealtimeSession(joinSessionId.value.trim())
    joinSessionId.value = selectedSessionId.value
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

async function deleteRealtimeSession() {
  sessionActionError.value = null
  try {
    await store.deleteRealtimeSession()
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

async function restoreConversation(sessionId: string) {
  joinSessionId.value = sessionId
  await joinRealtimeSession()
}

async function copyPhoneEntryUrl() {
  if (!phoneEntryUrl.value)
    return

  try {
    await navigator.clipboard.writeText(phoneEntryUrl.value)
  }
  catch (error) {
    sessionActionError.value = errorMessage(error)
  }
}

function openPhoneEntryUrl() {
  if (!phoneEntryUrl.value)
    return
  window.open(phoneEntryUrl.value, '_blank', 'noopener,noreferrer')
}

function sendRealtimePrompt() {
  if (!realtimePrompt.value.trim())
    return

  store.sendRealtimeText(realtimePrompt.value.trim())
  realtimePrompt.value = ''
}

function toggleAutoObserve() {
  if (autoObserving.value) {
    store.stopAutoObserve()
  }
  else {
    store.startAutoObserve(autoObserveInterval.value)
  }
}

async function switchDevice(deviceId: string) {
  selectedDeviceId.value = deviceId
  if (sourceMode.value === 'camera')
    await openCamera()
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
    joinSessionId.value = sessionId
}, { immediate: true })

watch(sessionRecords, (records) => {
  if (!selectedSessionId.value && !joinSessionId.value && records[0])
    joinSessionId.value = records[0].sessionId
}, { immediate: true })

watch([sourceMode, participantKind], ([mode, kind]) => {
  if (kind === 'phone') {
    signalAccessPreset.value = 'phone-remote'
  }
  else if (mode === 'screen') {
    signalAccessPreset.value = 'desktop-screen-mic'
  }
  else {
    signalAccessPreset.value = 'desktop-camera-mic'
  }
}, { immediate: true })

onMounted(async () => {
  store.setParticipantKind('desktop')
  await Promise.all([
    store.enumerateVideoDevices(),
    store.refreshSessionRecords(),
  ])

  if (selectedSessionId.value)
    joinSessionId.value = selectedSessionId.value

  if (hasElectronRuntime.value) {
    enabled.value = true
    await refreshDesktopSetupStatus()
    if (desktopSetupStatus.value?.state !== 'ready')
      await runDesktopSetup(true)
  }
})

onBeforeUnmount(() => {
  if (autoObserving.value)
    store.stopAutoObserve()
  stopSource()
  stopDesktopSetupPolling()
})
</script>

<template>
  <div class="min-h-0 flex flex-col gap-6 pb-6">
    <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
      <div class="flex flex-col gap-4">
        <div class="text-sm text-neutral-500 leading-6 dark:text-neutral-400">
          One fixed realtime pipeline in AIRI: selectable input source, explicit rolling scene memory, persisted conversation records, and streamed output.
        </div>

        <FieldCheckbox v-model="enabled" label="Enable Visual Chat" description="When off, session state and status are cleared." />

        <div v-if="enabled" class="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <CollapsibleSection title="Setup Checklist" :badge="setupChecklistBadge">
            <div class="grid gap-2">
              <div
                v-for="item in setupChecklist"
                :key="item.label"
                class="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-950/40"
              >
                <span
                  class="mt-0.5 h-5 w-5 inline-flex flex-none items-center justify-center rounded-full text-[11px] font-semibold"
                  :class="item.done
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'"
                >
                  {{ item.done ? 'OK' : '...' }}
                </span>
                <div class="min-w-0">
                  <div class="text-neutral-700 font-medium dark:text-neutral-200">
                    {{ item.label }}
                  </div>
                  <div class="text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                    {{ item.detail }}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Desktop Setup" :badge="desktopSetupBadge">
            <div class="mb-2 flex justify-end">
              <Button
                v-if="hasElectronRuntime"
                variant="secondary"
                :disabled="desktopSetupStatus?.state === 'installing-engine' || desktopSetupStatus?.state === 'pulling-model' || desktopSetupStatus?.state === 'starting-services'"
                @click="runDesktopSetup()"
              >
                {{ desktopSetupStatus?.state === 'ready' ? 'Recheck' : 'Run Setup' }}
              </Button>
            </div>

            <div v-if="hasElectronRuntime" class="grid gap-3 text-sm text-neutral-600 dark:text-neutral-300">
              <div class="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950/40">
                <div class="text-xs text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400">
                  State
                </div>
                <div class="mt-1 text-neutral-800 font-medium dark:text-neutral-100">
                  {{ desktopSetupStatus?.state || 'checking' }}
                </div>
                <div v-if="desktopSetupStatus?.error || desktopSetupError" class="mt-1 text-xs text-red-500 leading-5 dark:text-red-300">
                  {{ desktopSetupStatus?.error || desktopSetupError }}
                </div>
              </div>

              <div v-if="desktopSetupStatus?.steps?.length" class="grid gap-2">
                <div
                  v-for="step in desktopSetupStatus.steps"
                  :key="step.id"
                  class="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950/40"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="text-neutral-800 font-medium dark:text-neutral-100">
                      {{ step.label }}
                    </div>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
                      :class="step.status === 'done'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : step.status === 'running'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                          : step.status === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
                            : step.status === 'skipped'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'"
                    >
                      {{ step.status }}
                    </span>
                  </div>
                  <div class="mt-1 text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                    {{ step.detail }}
                  </div>
                </div>
              </div>

              <div v-if="desktopSetupStatus?.logs?.length" class="rounded-lg bg-neutral-950 px-3 py-2 text-xs text-neutral-100 leading-5">
                <div class="mb-2 text-[11px] text-neutral-400 font-medium tracking-wide uppercase">
                  Setup Log
                </div>
                <div class="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono">
                  {{ desktopSetupStatus.logs.join('\n') }}
                </div>
              </div>
            </div>

            <div v-else class="grid gap-3 text-sm text-neutral-600 dark:text-neutral-300">
              <div>
                Desktop auto-setup is available in the tamagotchi desktop app. In a plain browser build, start the fixed pipeline before using this page.
              </div>
              <code class="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                pnpm dev:tamagotchi
              </code>
            </div>
          </CollapsibleSection>
        </div>

        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div class="flex flex-col gap-1">
            <label class="text-sm text-neutral-600 font-medium dark:text-neutral-300">Gateway URL</label>
            <Input v-model="gatewayUrl" placeholder="http://localhost:6200" />
          </div>
          <div class="flex items-end">
            <Button :disabled="loading" @click="store.refreshAll()">
              Refresh Status
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="{
              'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200': !enabled || connectionStatus === 'idle',
              'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200': enabled && connectionStatus === 'connecting',
              'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200': enabled && connectionStatus === 'connected',
              'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200': enabled && connectionStatus === 'disconnected',
              'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200': enabled && connectionStatus === 'error',
            }"
          >
            Gateway: {{ connectionStatus }}
          </span>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="modelReady
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'"
          >
            Worker: {{ modelReady ? 'Ready' : 'Not ready' }}
          </span>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="realtimeStatus === 'connected'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'"
          >
            Realtime: {{ realtimeStatus }}
          </span>
          <span
            v-if="isReconnecting"
            class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 font-medium dark:bg-amber-900/40 dark:text-amber-200"
          >
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Reconnecting...
          </span>
        </div>

        <div
          v-if="gatewayUrlNeedsHostRewrite || phoneBrowserNeedsHttps"
          class="border border-amber-200 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100"
        >
          <div v-if="gatewayUrlNeedsHostRewrite">
            This page is opened from another device, but Visual Chat is still pointing at loopback. Switch to the current device host so the phone page can reach the gateway.
          </div>
          <div v-if="phoneBrowserNeedsHttps" class="mt-2">
            Remote phone camera capture usually needs HTTPS or a native webview instead of plain LAN HTTP.
          </div>
          <div v-if="gatewayUrlNeedsHostRewrite" class="mt-3 flex flex-wrap gap-2">
            <Button :disabled="!suggestedGatewayUrl" @click="store.applySuggestedNetworkUrls()">
              Use Current Device Host
            </Button>
            <span class="self-center text-xs opacity-80">
              {{ suggestedGatewayUrl || 'No mobile-reachable host detected yet' }}
            </span>
          </div>
        </div>

        <div v-if="enabled && hasFixedModel" class="border border-neutral-200 rounded-lg bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-neutral-500 font-medium dark:text-neutral-400">Fixed model</span>
            <span class="text-sm text-neutral-800 font-medium dark:text-neutral-100">{{ fixedModelName || '--' }}</span>
            <span class="text-[11px] text-neutral-400 leading-tight">
              Visual Chat now runs on one fixed backend model and one fixed session mode so the pipeline stays explicit and debuggable.
            </span>
          </div>
        </div>

        <div v-if="enabled" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div class="flex flex-col gap-3">
            <CollapsibleSection title="Session" :default-open="true" :badge="sessionBadge">
              <div class="grid gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-neutral-500 font-medium dark:text-neutral-400">Join existing session</label>
                  <Input v-model="joinSessionId" placeholder="session id" @keydown.enter="joinRealtimeSession" />
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button @click="createRealtimeSession">
                    Create Session
                  </Button>
                  <Button variant="secondary" :disabled="!joinSessionId.trim()" @click="joinRealtimeSession">
                    Join Session
                  </Button>
                  <Button variant="secondary" :disabled="!hasRealtimeSession" @click="leaveRealtimeSession">
                    Leave
                  </Button>
                  <Button variant="secondary" :disabled="!hasRealtimeSession" @click="deleteRealtimeSession">
                    Delete Session
                  </Button>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-neutral-500 font-medium dark:text-neutral-400">Current session</label>
                    <Input :model-value="selectedSessionId" readonly placeholder="Create or join a session first" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-neutral-500 font-medium dark:text-neutral-400">Phone entry</label>
                    <div class="flex gap-2">
                      <Input :model-value="phoneEntryUrl" readonly :placeholder="phoneEntryUnavailableReason || 'Phone-ready URL will appear here'" />
                      <Button variant="secondary" :disabled="!phoneEntryUrl" @click="copyPhoneEntryUrl">
                        Copy
                      </Button>
                      <Button variant="secondary" :disabled="!phoneEntryUrl" @click="openPhoneEntryUrl">
                        Open
                      </Button>
                    </div>
                    <div v-if="phoneEntryUrl" class="text-[11px] text-neutral-400 leading-tight">
                      Resolved host: {{ bestMobileReachableHost || 'none' }}{{ phoneEntryOverrideHost ? ' (manual override)' : '' }}
                    </div>
                    <div v-else class="text-[11px] text-neutral-400 leading-tight">
                      {{ phoneEntryUnavailableReason }}
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-neutral-500 font-medium dark:text-neutral-400">
                      Fixed host override
                      <span class="font-normal opacity-70">(IP or hostname, persisted)</span>
                    </label>
                    <div class="flex gap-2">
                      <Input
                        v-model="phoneEntryOverrideHost"
                        placeholder="e.g. 192.168.1.100 or my-desktop.local"
                      />
                      <Button
                        v-if="phoneEntryOverrideHost"
                        variant="secondary"
                        @click="phoneEntryOverrideHost = ''"
                      >
                        Clear
                      </Button>
                      <Button
                        v-else-if="bestMobileReachableHost"
                        variant="secondary"
                        @click="phoneEntryOverrideHost = bestMobileReachableHost"
                      >
                        Lock current
                      </Button>
                    </div>
                    <div class="text-[11px] text-neutral-400 leading-tight">
                      Set an IP or hostname that your phone can always reach. This overrides auto-detection and persists across restarts.
                    </div>
                  </div>
                </div>

                <div class="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500 dark:bg-neutral-950/40 dark:text-neutral-400">
                  <div class="mb-1 text-[11px] font-medium tracking-wide uppercase">
                    Participant
                  </div>
                  <div class="font-mono">
                    {{ participantIdentity }}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Saved Conversations" :badge="savedConversationsBadge">
              <div class="mb-2 flex justify-end">
                <Button variant="secondary" :disabled="loading" @click="store.refreshSessionRecords()">
                  Refresh
                </Button>
              </div>

              <div v-if="sessionRecords.length === 0" class="text-sm text-neutral-500 dark:text-neutral-400">
                No persisted conversations yet. Create a session and send messages to save one.
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
          </div>

          <CollapsibleSection title="Input Mode" :default-open="true" :badge="inputModeBadge">
            <div class="grid gap-3">
              <div class="flex flex-col gap-2 lg:flex-row">
                <select
                  v-model="signalAccessPreset"
                  class="min-w-64 border border-neutral-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="phone-remote">
                    Phone camera
                  </option>
                  <option value="desktop-camera-mic">
                    Desktop camera
                  </option>
                  <option value="desktop-screen-mic">
                    Desktop screen
                  </option>
                </select>
                <Button variant="secondary" @click="applySignalAccessPreset">
                  Apply Input Mode
                </Button>
              </div>

              <div class="text-[11px] text-neutral-400 leading-tight">
                {{ signalAccessDescription }}
              </div>

              <template v-if="isPhoneMode">
                <div class="border border-neutral-300 rounded-lg border-dashed bg-neutral-50 p-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-400">
                  Camera controls are on the phone side. Use the Phone entry URL above to connect.
                </div>
              </template>

              <template v-else>
                <div v-if="isDesktopCameraMode" class="flex flex-col gap-1">
                  <label class="text-xs text-neutral-500 font-medium dark:text-neutral-400">Camera device</label>
                  <select
                    :value="selectedDeviceId"
                    class="border border-neutral-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    @change="switchDevice(($event.target as HTMLSelectElement).value)"
                  >
                    <option v-if="videoDevices.length === 0" value="">
                      No camera found
                    </option>
                    <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">
                      {{ device.label }}
                    </option>
                  </select>
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button v-if="isDesktopCameraMode" variant="secondary" @click="openCamera">
                    Open Camera
                  </Button>
                  <Button v-if="isDesktopScreenMode" variant="secondary" @click="openScreen">
                    Share Screen
                  </Button>
                  <Button variant="secondary" :disabled="!isStreaming" @click="stopSource">
                    Stop Video
                  </Button>
                </div>
              </template>
            </div>
          </CollapsibleSection>
        </div>

        <ErrorContainer v-if="lastError" title="Visual Chat" :error="lastError" />
        <ErrorContainer v-if="sourceError" title="Input Source" :error="sourceError" />
        <ErrorContainer v-if="sessionActionError" title="Realtime Session" :error="sessionActionError" />
      </div>
    </div>

    <div v-if="enabled" class="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <h3 class="mb-3 text-base text-neutral-700 font-medium dark:text-neutral-200">
          Live Preview
        </h3>

        <div class="flex flex-col gap-4">
          <div class="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video
              v-show="isStreaming"
              ref="videoRef"
              autoplay
              muted
              playsinline
              class="h-full w-full object-cover"
            />
            <div v-if="!isStreaming && isPhoneMode" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
              <div class="i-solar-smartphone-outline text-4xl" />
              <div>Phone is the active video source.</div>
              <div class="text-xs text-white/50">
                Camera frames stream from the phone through the gateway.
              </div>
            </div>
            <div v-else-if="!isStreaming" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
              <div class="i-solar-camera-outline text-4xl" />
              <div>Apply an input mode to start the fixed Visual Chat pipeline.</div>
            </div>

            <div class="absolute left-3 top-3 flex flex-wrap gap-2">
              <span
                v-if="isPhoneMode && hasRealtimeSession"
                class="rounded-full bg-indigo-500/85 px-2 py-1 text-[11px] text-white font-semibold tracking-wide uppercase"
              >
                Phone source
              </span>
              <span
                v-if="isStreaming"
                class="rounded-full bg-emerald-500/85 px-2 py-1 text-[11px] text-white font-semibold tracking-wide uppercase"
              >
                {{ sourceMode === 'screen' ? 'Screen live' : 'Camera live' }}
              </span>
              <span
                v-if="inferring"
                class="rounded-full bg-amber-500/90 px-2 py-1 text-[11px] text-white font-semibold tracking-wide uppercase"
              >
                Responding
              </span>
              <span
                v-if="autoObserving"
                class="rounded-full px-2 py-1 text-[11px] text-white font-semibold tracking-wide uppercase"
                :class="autoObserveInferring ? 'bg-violet-500/85 animate-pulse' : 'bg-violet-500/50'"
              >
                {{ autoObserveInferring ? 'Updating memory' : 'Auto-observe' }}
              </span>
            </div>
          </div>

          <div class="text-[11px] text-neutral-400 leading-tight">
            The fixed pipeline keeps only one path after source selection: live frames go into the shared session, text turns go through the gateway, and responses stream back into the conversation.
          </div>
        </div>
      </div>

      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <div class="grid gap-4">
          <div>
            <h3 class="text-base text-neutral-700 font-medium dark:text-neutral-200">
              Text Input
            </h3>
          </div>

          <div class="flex gap-2">
            <Input v-model="realtimePrompt" placeholder="Ask about the current live scene" @keydown.enter="sendRealtimePrompt" />
            <Button variant="secondary" :disabled="!hasRealtimeSession || !realtimePrompt.trim()" @click="sendRealtimePrompt">
              Send
            </Button>
            <Button variant="secondary" :disabled="!hasRealtimeSession" @click="store.requestRealtimeInference()">
              Observe
            </Button>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button
              :disabled="!hasRealtimeSession"
              :class="autoObserving ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''"
              @click="toggleAutoObserve"
            >
              {{ autoObserving ? 'Stop Continuous' : 'Continuous Observation' }}
            </Button>
            <select
              v-model.number="autoObserveInterval"
              :disabled="autoObserving"
              class="border border-neutral-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option :value="3000">
                Every 3s
              </option>
              <option :value="5000">
                Every 5s
              </option>
              <option :value="10000">
                Every 10s
              </option>
            </select>
            <div v-if="autoObserving" class="flex flex-col gap-1.5">
              <span class="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span class="h-2 w-2 rounded-full" :class="autoObserveInferring ? 'bg-violet-500 animate-pulse' : 'bg-emerald-500 animate-pulse'" />
                {{ autoObserveInferring ? 'Processing frame...' : `Idle — next in ≤${((autoObservePipelineStats?.adaptiveIntervalMs ?? autoObserveIntervalMs) / 1000).toFixed(1)}s` }}
              </span>
              <div v-if="autoObservePipelineStats" class="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400 tracking-wide uppercase">
                <span>{{ autoObservePipelineStats.autoObserveInferences }} runs</span>
                <span>{{ autoObservePipelineStats.skippedAutoObserve }} busy-skips</span>
                <span>{{ autoObservePipelineStats.skippedNoChange }} no-change</span>
                <span v-if="autoObservePipelineStats.timedOut > 0" class="text-amber-500">{{ autoObservePipelineStats.timedOut }} timeouts</span>
                <span>avg {{ Math.round(autoObservePipelineStats.avgLatencyMs) }}ms</span>
                <span>last {{ Math.round(autoObservePipelineStats.lastLatencyMs) }}ms</span>
                <span v-if="autoObservePipelineStats.adaptiveIntervalMs !== autoObservePipelineStats.baseIntervalMs">
                  adaptive {{ (autoObservePipelineStats.adaptiveIntervalMs / 1000).toFixed(1) }}s
                </span>
              </div>
            </div>
          </div>

          <CollapsibleSection title="Rolling Scene Memory" :badge="rollingMemoryBadge">
            <div class="text-xs text-neutral-500 leading-5 dark:text-neutral-400">
              Continuous observation updates this hidden memory. Manual Observe and user questions read from it.
            </div>
            <div class="mt-2 whitespace-pre-wrap text-sm text-neutral-600 leading-6 dark:text-neutral-300">
              {{ sessionMemorySummary || 'No scene memory captured yet. Start one video source, then use Continuous Observation or Observe once.' }}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Context State" :badge="contextStateBadge">
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div class="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/40">
                <div class="text-[11px] text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400">
                  Live History (last 6 turns sent to model)
                </div>
                <div v-if="historyWindowPreview.length === 0" class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  No history yet. Send a message to start building context.
                </div>
                <div v-else class="mt-2 max-h-48 flex flex-col gap-1.5 overflow-y-auto pr-1">
                  <div
                    v-for="(turn, idx) in historyWindowPreview"
                    :key="idx"
                    class="flex items-start gap-2 rounded px-2 py-1 text-xs"
                    :class="turn.role === 'user' ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-neutral-100 dark:bg-neutral-900'"
                  >
                    <span class="mt-0.5 flex-none text-[10px] font-semibold tracking-wide uppercase" :class="turn.role === 'user' ? 'text-blue-500' : 'text-neutral-400'">
                      {{ turn.role === 'user' ? 'U' : 'A' }}
                    </span>
                    <span class="text-neutral-600 leading-5 dark:text-neutral-300">{{ turn.preview }}</span>
                  </div>
                </div>
              </div>

              <div class="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/40">
                <div class="text-[11px] text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400">
                  Session Record
                </div>
                <div v-if="currentSessionRecord" class="grid mt-2 gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  <div>{{ currentSessionRecord.title || 'New visual chat' }} &middot; {{ currentSessionRecord.messageCount }} messages</div>
                  <div v-if="currentSessionRecord.summary" class="text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                    {{ currentSessionRecord.summary }}
                  </div>
                  <div class="mt-1 text-xs text-neutral-500 leading-5 dark:text-neutral-400">
                    Memory: {{ sessionMemorySummary ? 'Active' : 'Empty' }}
                  </div>
                  <div class="text-[10px] text-neutral-400 tracking-wide uppercase">
                    Created {{ new Date(currentSessionRecord.createdAt).toLocaleString() }} &middot; Updated {{ new Date(currentSessionRecord.updatedAt).toLocaleString() }}
                  </div>
                </div>
                <div v-else class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  No active session record.
                </div>
              </div>
            </div>

            <div class="mt-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/40">
              <div class="mb-2 text-[11px] text-neutral-500 font-medium tracking-wide uppercase dark:text-neutral-400">
                Scene Memory Timeline
              </div>

              <div v-if="currentMemoryTimeline.length === 0" class="text-sm text-neutral-500 dark:text-neutral-400">
                No persisted scene-memory snapshots yet.
              </div>

              <div v-else class="max-h-56 flex flex-col gap-2 overflow-y-auto pr-1">
                <div
                  v-for="snapshot in currentMemoryTimeline"
                  :key="`${snapshot.updatedAt}:${snapshot.sourceId || 'scene'}`"
                  class="rounded-lg bg-white px-3 py-2 text-sm text-neutral-600 leading-6 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  <div class="flex items-center justify-between gap-3 text-[11px] text-neutral-400 tracking-wide uppercase">
                    <span>{{ new Date(snapshot.updatedAt).toLocaleString() }}</span>
                    <span>{{ snapshot.sourceId || 'scene-memory' }}</span>
                  </div>
                  <div class="mt-1 whitespace-pre-wrap">
                    {{ snapshot.summary }}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <div class="h-[min(64vh,760px)] min-h-0 flex flex-col overflow-hidden rounded-xl bg-[#11151b] text-white">
            <div class="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <div class="text-xs text-white/45 font-semibold tracking-[0.24em] uppercase">
                  Session Conversation
                </div>
                <div class="mt-1 text-sm text-white/70">
                  {{ activeSession?.mode || 'Create or join a session to start' }}
                </div>
              </div>

              <Button variant="secondary" :disabled="loading" @click="createRealtimeSession">
                New Conversation
              </Button>
            </div>

            <div ref="chatContainerRef" class="flex-1 overflow-y-auto px-4 py-4">
              <div v-if="chatMessages.length === 0" class="h-full flex items-center justify-center text-center text-sm text-white/45">
                Select an input mode, then type to start the conversation.
              </div>

              <div v-else class="flex flex-col gap-3">
                <div
                  v-for="(msg, index) in chatMessages"
                  :key="msg.id || index"
                  class="flex"
                  :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <div
                    class="max-w-[88%] min-w-0 rounded-2xl px-3 py-2 text-sm leading-6"
                    :class="msg.role === 'user'
                      ? 'bg-[#d8f264] text-[#172109]'
                      : 'bg-white/10 text-white'"
                  >
                    <MarkdownRenderer
                      v-if="msg.role === 'assistant'"
                      :content="msg.content"
                      class="visual-chat-md min-w-0 break-words"
                    />
                    <div v-else class="whitespace-pre-wrap break-words">
                      {{ msg.content }}
                    </div>

                    <div class="mt-2 flex flex-wrap items-center gap-2 text-[10px] tracking-wide uppercase opacity-60">
                      <span>{{ msg.role }}</span>
                      <span v-if="msg.model">{{ msg.model }}</span>
                      <span v-if="msg.durationMs">{{ (msg.durationMs / 1000).toFixed(1) }}s</span>
                    </div>
                  </div>
                </div>

                <div v-if="inferring" class="flex justify-start">
                  <div class="rounded-2xl bg-white/8 px-3 py-2 text-sm text-white/60">
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
  layout: settings
  title: Visual Chat
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
