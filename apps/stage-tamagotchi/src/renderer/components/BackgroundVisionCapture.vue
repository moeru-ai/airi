<script setup lang="ts">
import type { VisionWorkloadId } from '@proj-airi/stage-ui/composables'
import type { SourcesOptions } from 'electron'

import { useVisionOrchestratorStore, useVisionProcessingStore, useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useVisionScreenCapture } from '../composables/use-vision-screen-capture'

// Resident, headless screen-capture driver for the desktop pet.
//
// Why this exists:
// - The devtools Vision page is the only place that wires the capture loop
//   (`startTicker`). Closing it unmounts the loop, so vision only ran while
//   devtools was open. This component lives in the always-mounted app shell so
//   capture can run in the background, gated purely by the persisted
//   `backgroundCaptureEnabled` setting.
//
// Scope (per product decision):
// - Auto-captures the primary screen (first `screen:` source); no source picker.
// - Always uses the `screen:interpret` workload and publishes context so the
//   latest frame summary reaches the chat backbone.

// Fixed workload: general "what is the user doing" interpretation.
const WORKLOAD_ID: VisionWorkloadId = 'screen:interpret'

// Only enumerate full displays — background capture targets the primary screen.
const sourcesOptions = ref<SourcesOptions>({ types: ['screen'] })

const visionStore = useVisionStore()
const visionProcessingStore = useVisionProcessingStore()
const visionOrchestratorStore = useVisionOrchestratorStore()

const { configured } = storeToRefs(visionStore)
const { backgroundCaptureEnabled, isRunning } = storeToRefs(visionProcessingStore)

const videoRef = ref<HTMLVideoElement | null>(null)

const {
  sources,
  activeSourceId,
  activeStream,
  refetchSources,
  startStream,
  stopStream,
  cleanup,
  captureFrame,
} = useVisionScreenCapture(sourcesOptions)

function hasLiveVideoStream(stream: MediaStream | null) {
  if (!stream)
    return false

  return stream.getVideoTracks().some(track => track.readyState === 'live')
}

// Bind the active capture stream to the hidden <video> and wait until it has
// decoded at least one frame, so the first capture is not a blank canvas.
async function ensureVideoStream() {
  if (!activeSourceId.value)
    return

  const stream = await startStream()
  const video = videoRef.value
  if (!video)
    return

  video.srcObject = stream
  await video.play()

  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }

    const onLoaded = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      resolve()
    }
    video.addEventListener('loadedmetadata', onLoaded)
  })
}

async function handleVisionTick() {
  if (!activeSourceId.value)
    return

  // Recover transparently if the OS ended the share (track went to 'ended').
  if (!hasLiveVideoStream(activeStream.value)) {
    stopStream()
    await ensureVideoStream()
  }

  const video = videoRef.value
  if (!video)
    return

  const dataUrl = captureFrame(video, 0.82, 1280, 720)
  if (!dataUrl)
    return

  const capturedAt = Date.now()
  const result = await visionOrchestratorStore.processCapture({
    imageDataUrl: dataUrl,
    workloadId: WORKLOAD_ID,
    sourceId: activeSourceId.value,
    capturedAt,
    // Background capture's whole point is to feed chat context.
    publishContext: true,
  })

  return { capturedAt, contextUpdates: result.contextUpdates }
}

// Pick the primary display and start the resident ticker. No-op when the
// vision provider/model is not configured yet, or when already running.
async function start() {
  if (!backgroundCaptureEnabled.value || !configured.value)
    return
  if (isRunning.value)
    return

  try {
    await refetchSources()
    const primaryScreen = sources.value.find(source => source.id.startsWith('screen:'))
    if (!primaryScreen) {
      visionOrchestratorStore.recordError(new Error('No screen source available for background capture'))
      return
    }
    activeSourceId.value = primaryScreen.id

    await ensureVideoStream()
    visionProcessingStore.startTicker(handleVisionTick)
  }
  catch (error) {
    visionOrchestratorStore.recordError(error)
  }
}

function stop() {
  visionProcessingStore.stopTicker()
  stopStream()
  const video = videoRef.value
  if (video) {
    video.pause()
    video.srcObject = null
  }
}

// --- Cross-window single-capture election ------------------------------------
// Every Electron window mounts this component and shares backgroundCaptureEnabled via
// localStorage, so without coordination all N windows would capture and hit the VLM at once,
// saturating its serialized inference queue (latency explodes, requests time out). Elect exactly
// one capture leader through a localStorage lease; only the leader runs the loop.
const INSTANCE_ID = crypto.randomUUID()
const LEADER_LEASE_MS = 8000
const LEADER_HEARTBEAT_MS = 3000
const captureLeader = useLocalStorage<{ id: string, at: number }>('vision/capture-leader', { id: '', at: 0 })

// Claim leadership when the slot is free, already ours, or the lease has gone stale (leader
// window closed). Refreshes the lease timestamp while we hold it.
function claimLeadershipIfAvailable(): boolean {
  const rec = captureLeader.value
  const now = Date.now()
  if (!rec.id || rec.id === INSTANCE_ID || now - rec.at > LEADER_LEASE_MS) {
    captureLeader.value = { id: INSTANCE_ID, at: now }
    return true
  }
  return false
}

function releaseLeadership() {
  if (captureLeader.value.id === INSTANCE_ID)
    captureLeader.value = { id: '', at: 0 }
}

let heartbeat: ReturnType<typeof setInterval> | null = null

// Only the leader window that also has capture enabled and a configured model runs the loop.
function reconcile() {
  if (!backgroundCaptureEnabled.value || !configured.value) {
    releaseLeadership()
    stop()
    return
  }
  if (claimLeadershipIfAvailable())
    void start()
  else
    stop()
}

watch(() => [backgroundCaptureEnabled.value, configured.value], () => reconcile())

onMounted(() => {
  reconcile()
  heartbeat = setInterval(reconcile, LEADER_HEARTBEAT_MS)
})

onBeforeUnmount(() => {
  if (heartbeat)
    clearInterval(heartbeat)
  heartbeat = null
  releaseLeadership()
  stop()
  cleanup()
})
</script>

<template>
  <!-- Off-screen video sink; never visible, only used to decode capture frames. -->
  <video
    ref="videoRef"
    muted
    autoplay
    playsinline
    aria-hidden="true"
    :class="['pointer-events-none', 'fixed', 'h-px', 'w-px', 'opacity-0', '-left-px', '-top-px']"
  />
</template>
