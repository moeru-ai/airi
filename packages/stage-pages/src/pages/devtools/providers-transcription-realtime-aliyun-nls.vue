<script setup lang="ts">
import type { ServerEvent, ServerEvents } from '@proj-airi/stage-ui/stores/providers/aliyun'

import vadWorkletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { Button } from '@proj-airi/stage-ui/components'
import { createAliyunNLSSession } from '@proj-airi/stage-ui/stores/providers/aliyun'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
type AliyunRegion
  = | 'cn-shanghai'
    | 'cn-shanghai-internal'
    | 'cn-beijing'
    | 'cn-beijing-internal'
    | 'cn-shenzhen'
    | 'cn-shenzhen-internal'

const credentials = reactive({
  accessKeyId: '',
  accessKeySecret: '',
  appKey: '',
  region: 'cn-shanghai' as AliyunRegion,
})

const connectionState = ref<ConnectionState>('idle')
const transcriptionReady = ref(false)
const isRecording = ref(false)
const currentPartial = ref<string | undefined>('')
const transcripts = ref<Array<{ index: number, text: string, final: boolean }>>([])

const websocket = shallowRef<WebSocket>()
const session = shallowRef<ReturnType<typeof createAliyunNLSSession>>()
const sessionId = ref('')

const audioContext = shallowRef<AudioContext>()
const workletNode = shallowRef<AudioWorkletNode>()
const mediaStreamSource = shallowRef<MediaStreamAudioSourceNode>()
const mediaStream = shallowRef<MediaStream>()

const logs = ref<Array<{ id: number, level: 'info' | 'error', text: string }>>([])
const logsContainer = ref<HTMLDivElement>()

const regionOptions: { label: string, value: AliyunRegion }[] = [
  { label: 'cn-shanghai', value: 'cn-shanghai' },
  { label: 'cn-beijing', value: 'cn-beijing' },
  { label: 'cn-shenzhen', value: 'cn-shenzhen' },
  { label: 'cn-shanghai (internal)', value: 'cn-shanghai-internal' },
  { label: 'cn-beijing (internal)', value: 'cn-beijing-internal' },
  { label: 'cn-shenzhen (internal)', value: 'cn-shenzhen-internal' },
]

const statusLabel = computed(() => {
  switch (connectionState.value) {
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'error':
      return 'Error'
    case 'closed':
      return 'Disconnected'
    default:
      return 'Idle'
  }
})

const statusColor = computed(() => {
  switch (connectionState.value) {
    case 'connected':
      return 'text-green-500'
    case 'connecting':
      return 'text-blue-500'
    case 'error':
      return 'text-red-500'
    default:
      return 'text-neutral-500 dark:text-neutral-400'
  }
})

const canConnect = computed(() => {
  return (
    !!credentials.accessKeyId
    && !!credentials.accessKeySecret
    && !!credentials.appKey
    && connectionState.value !== 'connecting'
    && connectionState.value !== 'connected'
  )
})

const canStartRecording = computed(() => {
  return connectionState.value === 'connected' && transcriptionReady.value && !isRecording.value
})

const canStopRecording = computed(() => isRecording.value)

const canDisconnect = computed(() => websocket.value && websocket.value.readyState !== WebSocket.CLOSED)

let audioChunkCount = 0
let lastChunkLogAt = 0

watch(logs, () => {
  nextTick(() => {
    const container = logsContainer.value
    if (container)
      container.scrollTop = container.scrollHeight
  })
})

function appendLog(message: string, level: 'info' | 'error' = 'info') {
  logs.value.push({
    id: Date.now() + Math.random(),
    level,
    text: `[${new Date().toLocaleTimeString()}] ${message}`,
  })
}

function float32ToInt16(buffer: Float32Array) {
  const output = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const value = Math.max(-1, Math.min(1, buffer[i]))
    output[i] = value < 0 ? value * 0x8000 : value * 0x7FFF
  }
  return output
}

function ensureWebSocketOpen() {
  return websocket.value && websocket.value.readyState === WebSocket.OPEN
}

function resetTranscriptionState() {
  transcriptionReady.value = false
  currentPartial.value = ''
  transcripts.value = []
  audioChunkCount = 0
  lastChunkLogAt = 0
}

async function initializeAudioGraph(stream: MediaStream) {
  const context = new AudioContext({
    sampleRate: 16000,
    latencyHint: 'interactive',
  })
  await context.audioWorklet.addModule(vadWorkletUrl)

  const node = new AudioWorkletNode(context, 'vad-audio-worklet-processor')
  node.port.onmessage = ({ data }: MessageEvent<{ buffer?: Float32Array }>) => {
    const buffer = data.buffer
    if (!buffer || !ensureWebSocketOpen())
      return

    audioChunkCount += 1
    if (audioChunkCount === 1 || audioChunkCount - lastChunkLogAt >= 50) {
      appendLog(`Streaming audio chunk #${audioChunkCount}`)
      lastChunkLogAt = audioChunkCount
    }

    const pcm16 = float32ToInt16(buffer)
    websocket.value?.send(pcm16.buffer)
  }

  const source = context.createMediaStreamSource(stream)
  source.connect(node)

  const silentGain = context.createGain()
  silentGain.gain.value = 0
  node.connect(silentGain)
  silentGain.connect(context.destination)

  audioContext.value = context
  workletNode.value = node
  mediaStreamSource.value = source
}

async function startRecording() {
  if (!ensureWebSocketOpen()) {
    appendLog('WebSocket is not ready. Connect before starting recording.', 'error')
    return
  }

  if (isRecording.value)
    return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    mediaStream.value = stream
    await initializeAudioGraph(stream)

    if (audioContext.value?.state === 'suspended')
      await audioContext.value.resume()

    isRecording.value = true
    appendLog('Recording started')
  }
  catch (error) {
    appendLog(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`, 'error')
    await stopRecording()
  }
}

async function stopRecording() {
  if (!isRecording.value)
    return

  try {
    workletNode.value?.port.postMessage({ type: 'stop' })
  }
  catch { /* ignore */ }

  if (mediaStreamSource.value) {
    mediaStreamSource.value.disconnect()
    mediaStreamSource.value = undefined
  }

  if (workletNode.value) {
    workletNode.value.port.onmessage = null
    workletNode.value.disconnect()
    workletNode.value = undefined
  }

  if (mediaStream.value) {
    mediaStream.value.getTracks().forEach(track => track.stop())
    mediaStream.value = undefined
  }

  if (audioContext.value) {
    try {
      await audioContext.value.close()
    }
    catch (error) {
      console.error('Failed to close audio context', error)
    }
    audioContext.value = undefined
  }

  isRecording.value = false
  appendLog('Recording stopped')
}

function handleServerEvent(event: ServerEvent) {
  switch (event.header.name) {
    case 'TranscriptionStarted':
    {
      const payload = event.payload as ServerEvents['TranscriptionStarted']
      transcriptionReady.value = true
      appendLog(`Transcription started. Session: ${payload.session_id}`)
      break
    }
    case 'TranscriptionResultChanged':
    {
      const payload = event.payload as ServerEvents['TranscriptionResultChanged']
      currentPartial.value = payload.result
      upsertTranscript(payload.index, payload.result, false)
      break
    }
    case 'SentenceEnd':
    {
      const payload = event.payload as ServerEvents['SentenceEnd']
      currentPartial.value = ''
      upsertTranscript(payload.index, payload.result, true)
      appendLog(`Sentence #${payload.index} (${payload.time}ms): ${payload.result}`)
      break
    }
    case 'TranscriptionCompleted':
      appendLog('Transcription completed')
      break
    default:
      appendLog(`Server event: ${event.header.name}`)
      break
  }
}

function upsertTranscript(index: number, text: string, final: boolean) {
  const existingIndex = transcripts.value.findIndex(entry => entry.index === index)

  if (existingIndex >= 0) {
    const existing = transcripts.value[existingIndex]
    transcripts.value.splice(existingIndex, 1, {
      index,
      text,
      final: existing.final || final,
    })
  }
  else {
    transcripts.value.push({ index, text, final })
  }

  transcripts.value.sort((a, b) => a.index - b.index)
}

async function connectWebSocket() {
  if (!canConnect.value)
    return

  resetTranscriptionState()
  connectionState.value = 'connecting'

  try {
    session.value = createAliyunNLSSession(
      credentials.accessKeyId.trim(),
      credentials.accessKeySecret.trim(),
      credentials.appKey.trim(),
      { region: credentials.region },
    )
    sessionId.value = session.value.sessionId

    const url = await session.value.websocketUrl()
    appendLog(`Connecting to ${url}`)

    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      connectionState.value = 'connected'
      appendLog('WebSocket connected')
      session.value?.start(ws, { enable_intermediate_result: true, enable_punctuation_prediction: true })
    }

    ws.onerror = (event) => {
      connectionState.value = 'error'
      appendLog(`WebSocket error: ${JSON.stringify(event)}`, 'error')
    }

    ws.onmessage = (messageEvent) => {
      try {
        const data = JSON.parse(messageEvent.data)
        session.value?.onEvent(data, handleServerEvent)
      }
      catch {
        appendLog(`Server message: ${messageEvent.data}`)
      }
    }

    ws.onclose = () => {
      connectionState.value = 'closed'
      appendLog('WebSocket closed by server')
      cleanupConnection()
    }

    websocket.value = ws
  }
  catch (error) {
    connectionState.value = 'error'
    appendLog(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`, 'error')
    cleanupConnection()
  }
}

async function disconnectWebSocket() {
  await stopRecording()

  if (websocket.value && websocket.value.readyState === WebSocket.OPEN) {
    try {
      session.value?.stop(websocket.value)
    }
    catch (error) {
      appendLog(`Failed to send stop event: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
    websocket.value.close()
  }
  else {
    cleanupConnection()
    connectionState.value = 'closed'
  }
}

function cleanupConnection() {
  stopRecording()
  websocket.value = undefined
  session.value = undefined
  resetTranscriptionState()
}

onBeforeUnmount(async () => {
  await disconnectWebSocket()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Aliyun NLS Realtime Transcription
      </h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Access Key ID and Secret with SpeechTranscriber permissions are required.
      </p>
    </div>

    <section class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <FieldInput
          v-model="credentials.accessKeyId"
          label="Access Key ID"
          description="RAM AccessKey ID with SpeechTranscriber permissions."
          placeholder="LTAI..."
        />

        <FieldInput
          v-model="credentials.accessKeySecret"
          label="Access Key Secret"
          description="Keep this secret safe; it never leaves this page."
          placeholder="****************"
          type="password"
        />

        <FieldInput
          v-model="credentials.appKey"
          label="App Key"
          description="NLS project AppKey to bind the transcription session."
          placeholder="请输入 AppKey"
        />

        <FieldSelect
          v-model="credentials.region"
          label="Region"
          description="Match the region used when issuing the token."
          :options="regionOptions"
          placeholder="cn-shanghai"
          layout="vertical"
        />
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div class="text-sm">
          <span class="text-neutral-500 dark:text-neutral-400">Status:</span>
          <span class="ml-2 font-medium" :class="statusColor">
            {{ statusLabel }}
          </span>
          <span v-if="isRecording" class="ml-2 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
            Recording
          </span>
        </div>

        <div class="flex flex-wrap gap-3">
          <Button
            :disabled="!canConnect"
            variant="primary"
            @click="connectWebSocket"
          >
            Connect
          </Button>

          <Button
            :disabled="!canStartRecording"
            variant="primary"
            @click="startRecording"
          >
            Listen
          </Button>

          <Button
            :disabled="!canStopRecording"
            variant="danger"
            @click="stopRecording"
          >
            Stop
          </Button>

          <Button
            :disabled="!canDisconnect"
            variant="secondary"
            @click="disconnectWebSocket"
          >
            Disconnect
          </Button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">
        Transcripts
      </h2>
      <div class="border border-neutral-200/80 rounded bg-neutral-50/60 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900/50">
        <div v-if="currentPartial" class="mb-3 text-neutral-500 dark:text-neutral-400">
          <div class="text-xs text-neutral-400 tracking-wide uppercase dark:text-neutral-500">
            Partial
          </div>
          <div class="mt-1 font-medium">
            {{ currentPartial }}
          </div>
        </div>
        <div v-if="!transcripts.length && !currentPartial" class="text-neutral-400 dark:text-neutral-600">
          Waiting for server...
        </div>
        <ul class="space-y-2">
          <li
            v-for="sentence in transcripts"
            :key="sentence.index"
            class="flex items-start gap-2"
          >
            <span class="mt-0.5 rounded bg-neutral-200/80 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-200">
              #{{ sentence.index }}
            </span>
            <div>
              <div class="font-medium" :class="sentence.final ? '' : 'italic text-neutral-500 dark:text-neutral-400'">
                {{ sentence.text }}
              </div>
              <div v-if="!sentence.final" class="text-xs text-neutral-400">
                Waiting for final result...
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">
        Logs
      </h2>
      <div
        ref="logsContainer"
        class="h-64 overflow-y-auto border border-neutral-200/80 rounded bg-neutral-50/60 p-3 text-xs leading-5 dark:border-neutral-700 dark:bg-neutral-900/50"
      >
        <div
          v-for="entry in logs"
          :key="entry.id"
          :class="entry.level === 'error' ? 'text-red-500' : 'text-neutral-700 dark:text-neutral-200'"
        >
          {{ entry.text }}
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
