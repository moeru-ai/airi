import { createEventHook } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useSpeakingStore } from '../audio'
import { useSettingsVolcRealtime } from '../settings/volc-realtime'

export type ServerMessage
  = | { type: 'audio', data: ArrayBuffer }
    | { type: 'audio_task', data: ArrayBuffer }
    | { type: 'asr', text: string, isFinal: boolean }
    | { type: 'chat', text: string }
    | { type: 'chat_ended' }
    | { type: 'task_started', taskText: string }
    | { type: 'task_result', text: string }
    | { type: 'state', state: string }
    | { type: 'error', message: string }

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error'

export const useVolcVoiceStore = defineStore('modules:volc-voice', () => {
  // Settings
  const settings = useSettingsVolcRealtime()
  const { serverUrl } = storeToRefs(settings)

  // State
  const connectionState = ref<ConnectionState>('disconnected')
  const asrText = ref('')
  const lastFinalAsrText = ref('')
  const isProcessingTask = ref(false)
  const currentTaskText = ref('')
  const lastTaskResult = ref('')

  // Internal
  const ws = shallowRef<WebSocket | null>(null)

  // Chat streaming state
  let isChatStreaming = false
  const chatResponseText = ref('')

  // Computed
  const isConnected = computed(() => connectionState.value === 'connected' || connectionState.value === 'streaming')
  const isStreaming = computed(() => connectionState.value === 'streaming')

  // Event hooks for external consumers (Stage.vue, ChatArea.vue, etc.)
  const audioReceivedHook = createEventHook<{ data: ArrayBuffer, isTask: boolean }>()
  const chatEndedHook = createEventHook<{ userText: string, assistantText: string }>()
  const interruptHook = createEventHook<void>()

  // --- Audio playback (gapless PCM scheduling + lip sync) ---
  // Kept here because streaming PCM requires gapless scheduling that doesn't fit playbackManager.
  // Uses useSpeakingStore for lip sync, which is shared with Stage.vue.

  const playbackContext = shallowRef<AudioContext | null>(null)
  let nextPlayTime = 0
  let analyserNode: AnalyserNode | null = null
  let lipSyncRAF: number | null = null
  let smoothedMouthOpen = 0
  let lastAudioEndTime = 0

  function getPlaybackContext(): AudioContext {
    if (!playbackContext.value) {
      playbackContext.value = new AudioContext({ sampleRate: 48000 })
      analyserNode = playbackContext.value.createAnalyser()
      analyserNode.fftSize = 512
      analyserNode.smoothingTimeConstant = 0.3
      analyserNode.connect(playbackContext.value.destination)
    }
    return playbackContext.value
  }

  function stopLipSync() {
    if (lipSyncRAF !== null) {
      cancelAnimationFrame(lipSyncRAF)
      lipSyncRAF = null
    }
    smoothedMouthOpen = 0
    const speakingStore = useSpeakingStore()
    speakingStore.mouthOpenSize = 0
    speakingStore.nowSpeaking = false
  }

  function startLipSyncLoop() {
    if (lipSyncRAF !== null)
      return

    const speakingStore = useSpeakingStore()
    speakingStore.nowSpeaking = true

    function tick() {
      if (!analyserNode || !playbackContext.value) {
        stopLipSync()
        return
      }

      const ctx = playbackContext.value
      if (ctx.currentTime > lastAudioEndTime + 0.15) {
        stopLipSync()
        return
      }

      const bufferLength = analyserNode.fftSize
      const dataArray = new Float32Array(bufferLength)
      analyserNode.getFloatTimeDomainData(dataArray)

      let sumSquares = 0
      for (let i = 0; i < bufferLength; i++) {
        sumSquares += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sumSquares / bufferLength)

      // Scale to 0-1 range to match AIRI's wLipSync system (getMouthOpen returns 0-1)
      const rawMouthOpen = Math.min(1.0, rms * 5.0)

      // Faster attack (opening mouth), slower release (closing mouth)
      const lerpFactor = rawMouthOpen > smoothedMouthOpen ? 0.5 : 0.25
      smoothedMouthOpen = smoothedMouthOpen + (rawMouthOpen - smoothedMouthOpen) * lerpFactor
      speakingStore.mouthOpenSize = smoothedMouthOpen

      lipSyncRAF = requestAnimationFrame(tick)
    }

    lipSyncRAF = requestAnimationFrame(tick)
  }

  function interruptPlayback() {
    stopLipSync()
    analyserNode = null
    if (playbackContext.value) {
      playbackContext.value.close()
      playbackContext.value = null
      nextPlayTime = 0
    }
    interruptHook.trigger()
  }

  function playPCMAudio(pcmData: ArrayBuffer) {
    const ctx = getPlaybackContext()
    const int16 = new Int16Array(pcmData)

    // Upsample 24kHz → 48kHz (linear interpolation)
    const ratio = 48000 / 24000
    const outLen = Math.floor(int16.length * ratio)
    const buffer = ctx.createBuffer(1, outLen, 48000)
    const channel = buffer.getChannelData(0)

    for (let i = 0; i < outLen; i++) {
      const srcIdx = i / ratio
      const idx0 = Math.floor(srcIdx)
      const idx1 = Math.min(idx0 + 1, int16.length - 1)
      const frac = srcIdx - idx0
      channel[i] = (int16[idx0] / 32768) * (1 - frac) + (int16[idx1] / 32768) * frac
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    if (analyserNode) {
      source.connect(analyserNode)
    }
    else {
      source.connect(ctx.destination)
    }

    const now = ctx.currentTime
    if (nextPlayTime < now)
      nextPlayTime = now
    source.start(nextPlayTime)
    nextPlayTime += buffer.duration
    lastAudioEndTime = nextPlayTime

    startLipSyncLoop()
  }

  // --- WebSocket message handling ---

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'audio':
      case 'audio_task': {
        playPCMAudio(msg.data)
        audioReceivedHook.trigger({ data: msg.data, isTask: msg.type === 'audio_task' })
        break
      }
      case 'asr': {
        asrText.value = msg.text
        if (msg.isFinal) {
          lastFinalAsrText.value = msg.text
          asrText.value = ''
        }
        break
      }
      case 'chat': {
        if (!isChatStreaming) {
          chatResponseText.value = ''
          isChatStreaming = true
        }
        chatResponseText.value += msg.text
        break
      }
      case 'chat_ended': {
        isChatStreaming = false
        chatEndedHook.trigger({
          userText: lastFinalAsrText.value,
          assistantText: chatResponseText.value,
        })
        break
      }
      case 'task_started': {
        isProcessingTask.value = true
        currentTaskText.value = msg.taskText
        break
      }
      case 'task_result': {
        isProcessingTask.value = false
        lastTaskResult.value = msg.text
        currentTaskText.value = ''
        break
      }
      case 'state': {
        if (msg.state === 'connected' || msg.state === 'streaming' || msg.state === 'disconnected') {
          connectionState.value = msg.state as ConnectionState
        }
        else if (msg.state === 'listening') {
          interruptPlayback()
        }
        break
      }
      case 'error': {
        console.error('[VolcVoice] Server error:', msg.message)
        break
      }
    }
  }

  // --- WebSocket connection ---

  function connect() {
    if (ws.value) {
      disconnect()
    }

    connectionState.value = 'connecting'

    const socket = new WebSocket(serverUrl.value)
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      connectionState.value = 'connected'

      // Send credentials config to voice-gateway so it can connect to Volcengine
      const config: Record<string, string> = {}
      if (settings.volcAppId)
        config.volcAppId = settings.volcAppId
      if (settings.volcAccessKey)
        config.volcAccessKey = settings.volcAccessKey
      if (settings.volcAppKey)
        config.volcAppKey = settings.volcAppKey
      if (settings.volcResourceId)
        config.volcResourceId = settings.volcResourceId
      if (settings.volcSpeaker)
        config.volcSpeaker = settings.volcSpeaker
      if (settings.volcDialogModel)
        config.volcDialogModel = settings.volcDialogModel

      socket.send(JSON.stringify({ type: 'config', ...config }))
    }

    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          const view = new DataView(event.data)
          const headerLen = view.getUint32(0, false)
          const headerBytes = new Uint8Array(event.data, 4, headerLen)
          const header = JSON.parse(new TextDecoder().decode(headerBytes))
          const pcmData = event.data.slice(4 + headerLen)
          handleServerMessage({ type: header.type === 'audio_task' ? 'audio_task' : 'audio', data: pcmData })
        }
        catch {
          handleServerMessage({ type: 'audio', data: event.data })
        }
        return
      }

      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        handleServerMessage(msg)
      }
      catch {
        console.warn('[VolcVoice] Failed to parse server message')
      }
    }

    socket.onclose = () => {
      connectionState.value = 'disconnected'
      ws.value = null
    }

    socket.onerror = () => {
      connectionState.value = 'error'
    }

    ws.value = socket
  }

  function disconnect() {
    interruptPlayback()

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    connectionState.value = 'disconnected'
  }

  // --- External audio input (called by index.vue audio forwarding) ---

  function sendAudioChunk(pcm16: ArrayBuffer) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN)
      return
    ws.value.send(pcm16)
  }

  function sendText(text: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN)
      return
    ws.value.send(JSON.stringify({ type: 'text', text }))
  }

  return {
    // State
    connectionState,
    asrText,
    lastFinalAsrText,
    chatResponseText,
    isProcessingTask,
    currentTaskText,
    lastTaskResult,

    // Computed
    isConnected,
    isStreaming,

    // Actions
    connect,
    disconnect,
    sendAudioChunk,
    sendText,

    // Event hooks
    onAudioReceived: audioReceivedHook.on,
    onChatEnded: chatEndedHook.on,
    onInterrupt: interruptHook.on,
  }
})
