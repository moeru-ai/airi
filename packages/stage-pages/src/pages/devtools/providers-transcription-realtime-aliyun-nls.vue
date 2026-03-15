<script setup lang="ts">
import type { ServerEvent, ServerEvents } from '@proj-airi/stage-ui/stores/providers/aliyun'

import vadWorkletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { createAliyunNLSProvider, streamAliyunTranscription } from '@proj-airi/stage-ui/stores/providers/aliyun/stream-transcription'
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'

type AliyunRegion
  = | 'cn-shanghai'
    | 'cn-shanghai-internal'
    | 'cn-beijing'
    | 'cn-beijing-internal'
    | 'cn-shenzhen'
    | 'cn-shenzhen-internal'

const SAMPLE_RATE = 16000

const credentials = reactive({
  accessKeyId: '',
  accessKeySecret: '',
  appKey: '',
  region: 'cn-shanghai' as AliyunRegion,
})

const isRecording = ref(false)
const isTranscribing = ref(false)
const currentPartial = ref<string | undefined>('')
const transcripts = ref<Array<{ index: number, text: string, final: boolean }>>([])

const audioContext = shallowRef<AudioContext>()
const workletNode = shallowRef<AudioWorkletNode>()
const mediaStreamSource = shallowRef<MediaStreamAudioSourceNode>()
const mediaStream = shallowRef<MediaStream>()

const audioStreamController = shallowRef<ReadableStreamDefaultController<ArrayBuffer>>()
const transcriptionAbortController = shallowRef<AbortController>()
const transcriptionTextPromise = shallowRef<Promise<string> | null>(null)

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

const credentialsReady = computed(() => {
  return Boolean(
    credentials.accessKeyId.trim()
    && credentials.accessKeySecret.trim()
    && credentials.appKey.trim(),
  )
})

const canStartRecording = computed(() => credentialsReady.value && !isRecording.value && !isTranscribing.value)
const canStopRecording = computed(() => isRecording.value)
const canAbortTranscription = computed(() => isTranscribing.value && Boolean(transcriptionAbortController.value))

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

function resetRecordingCounters() {
  audioChunkCount = 0
  lastChunkLogAt = 0
}

function resetTranscriptionOutput() {
  currentPartial.value = ''
  transcripts.value = []
}

async function initializeAudioGraph(stream: MediaStream) {
  const context = new AudioContext({
    sampleRate: SAMPLE_RATE,
    latencyHint: 'interactive',
  })
  await context.audioWorklet.addModule(vadWorkletUrl)

  const node = new AudioWorkletNode(context, 'vad-audio-worklet-processor')
  node.port.onmessage = ({ data }: MessageEvent<{ buffer?: Float32Array }>) => {
    const buffer = data.buffer
    const controller = audioStreamController.value
    if (!buffer || !controller)
      return

    const pcm16 = float32ToInt16(buffer)
    controller.enqueue(pcm16.buffer.slice(0))

    audioChunkCount += 1
    if (audioChunkCount === 1 || audioChunkCount - lastChunkLogAt >= 50) {
      appendLog(`Streaming audio chunk #${audioChunkCount}`)
      lastChunkLogAt = audioChunkCount
    }
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
  if (!canStartRecording.value)
    return

  resetTranscriptionOutput()
  resetRecordingCounters()

  const abortController = new AbortController()
  transcriptionAbortController.value = abortController

  const audioStream = new ReadableStream<ArrayBuffer>({
    start(controller) {
      audioStreamController.value = controller
    },
    cancel: () => {
      audioStreamController.value = undefined
    },
  })

  appendLog('Initializing realtime transcription session')

  const transcriptionResult = streamAliyunTranscription({
    ...createAliyunNLSProvider(
      credentials.accessKeyId.trim(),
      credentials.accessKeySecret.trim(),
      credentials.appKey.trim(),
      { region: credentials.region },
    ).speech('aliyun-nls-v1', {
      abortSignal: abortController.signal,
      sessionOptions: {
        format: 'pcm',
        sample_rate: SAMPLE_RATE,
      },
      hooks: {
        onServerEvent: (event) => {
          handleServerEvent(event)
        },
      },
      onSessionTerminated: (error) => {
        if (error) {
          appendLog(`Session terminated: ${error instanceof Error ? error.message : String(error)}`, 'error')
          isTranscribing.value = false
        }
      },
    }),
    inputAudioStream: audioStream,
  } as unknown as Parameters<typeof streamAliyunTranscription>[0])
  transcriptionTextPromise.value = transcriptionResult.text
  isTranscribing.value = true

  transcriptionResult.text
    .then((finalText) => {
      if (finalText.trim())
        appendLog(`Transcription finished (${finalText.trim().length} characters)`)
      else
        appendLog('Transcription finished (no speech detected)')
    })
    .catch((error) => {
      console.error(error)
      if (error instanceof DOMException && error.name === 'AbortError')
        appendLog('Transcription aborted by user')
      else
        appendLog(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    })
    .finally(() => {
      isTranscribing.value = false
      transcriptionAbortController.value = undefined
      transcriptionTextPromise.value = null
    })

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
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
    console.error(error)
    appendLog(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`, 'error')
    audioStreamController.value?.error(error instanceof Error ? error : new Error(String(error)))
    audioStreamController.value = undefined
    abortTranscription()
    await stopRecording()
  }
}

async function stopRecording() {
  if (!isRecording.value && !audioContext.value && !audioStreamController.value)
    return

  try {
    workletNode.value?.port.postMessage({ type: 'stop' })
  }
  catch { /* noop */ }

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

  audioStreamController.value?.close()
  audioStreamController.value = undefined

  if (isRecording.value)
    appendLog('Recording stopped')

  isRecording.value = false
  resetRecordingCounters()

  if (isTranscribing.value) {
    try {
      await transcriptionTextPromise.value
    }
    catch { /* handled elsewhere */ }
  }
}

function abortTranscription() {
  if (!transcriptionAbortController.value)
    return

  transcriptionAbortController.value.abort(new DOMException('Aborted by user', 'AbortError'))
  audioStreamController.value?.error(new DOMException('Aborted by user', 'AbortError'))
  audioStreamController.value = undefined
  void stopRecording()
}

function handleServerEvent(event: ServerEvent) {
  switch (event.header.name) {
    case 'TranscriptionStarted':
      appendLog(`Transcription started. Session: ${(event.payload as ServerEvents['TranscriptionStarted']).session_id}`)
      break
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

onBeforeUnmount(async () => {
  await stopRecording()
  abortTranscription()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Aliyun NLS Realtime Transcription
      </h1>
      <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Provide your Access Key, Secret, and App Key to test Aliyun NLS streaming with microphone audio.
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
          <span
            v-if="isRecording"
            class="ml-2 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-500"
          >
            Recording
          </span>
          <span
            v-else-if="isTranscribing"
            class="ml-2 rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500"
          >
            Transcribing
          </span>
        </div>

        <div class="flex flex-wrap gap-3">
          <Button
            :disabled="!canStartRecording"
            variant="primary"
            @click="startRecording"
          >
            Start Recording
          </Button>

          <Button
            :disabled="!canStopRecording"
            variant="primary"
            @click="stopRecording"
          >
            Stop Recording
          </Button>

          <Button
            v-if="isTranscribing"
            :disabled="!canAbortTranscription"
            variant="secondary"
            @click="abortTranscription"
          >
            Abort Transcription
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
  title: Aliyun NLS Realtime Transcription
  subtitleKey: tamagotchi.settings.devtools.title
</route>
