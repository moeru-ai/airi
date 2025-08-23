<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import { useVRMLipSync } from '@proj-airi/stage-ui/composables'
import { useLive2DLipSync } from '@proj-airi/stage-ui/composables/live2d'
import { useChatStore, useConsciousnessStore, useProvidersStore, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { transcribeAudio } from '@proj-airi/stage-ui/stores/providers/tauri-transcription'
import { BasicTextarea } from '@proj-airi/ui'
import { generateSpeech } from '@xsai/generate-speech'
import { useLocalStorage, usePermission } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'

import TamagotchiChatHistory from './ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const microphonePermission = usePermission('microphone')

const autoSpeechEnabled = useLocalStorage('tamagotchi-chat-auto-speech', false)
const isSpeaking = ref(false)
const { selectedAudioInput } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, onAssistantResponseEnd, discoverToolsCompatibility } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())


const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const { audioContext } = useAudioContext()
const { stageView } = storeToRefs(useSettings())
const speakingStore = useSpeakingStore()
const { mouthOpenSize: globalMouthOpenSize, nowSpeaking } = storeToRefs(speakingStore)


const lipSyncUpdate = ref<((vrm: any) => void) | null>(null)
const live2dLipSync = ref<{ start: () => void, stop: () => void, mouthOpenSize: any } | null>(null)


function stripSSMLTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/<\|EMOTE_[^|]*\|>/g, '')
    .trim()
}


function isElevenLabsProvider(): boolean {
  return activeSpeechProvider.value === 'elevenlabs'
}

async function handleSend() {
  if (!messageInput.value.trim()) {
    return
  }

  const messageToSend = messageInput.value
  messageInput.value = ''

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await send(messageToSend, {
      model: activeModel.value,
      chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
      providerConfig,
    })
  }
  catch (error) {
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}


async function generateSpeechForText(text: string) {
  if (!activeSpeechProvider.value || !activeSpeechVoice.value || isSpeaking.value) {
    return
  }

  try {
    isSpeaking.value = true
    
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      // Speech provider initialization error removed
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)


    let input: string
    if (isElevenLabsProvider()) {

      input = stripSSMLTags(text)
    } else {

      input = ssmlEnabled.value
        ? speechStore.generateSSML(text, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
        : text
    }

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })


    const audioBuffer = await audioContext.decodeAudioData(res)
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    

    if (stageView.value === '2d') {

      const lipSync = useLive2DLipSync(source)
      live2dLipSync.value = lipSync
      lipSync.start()
      nowSpeaking.value = true
      

      const stopWatcher = watch(lipSync.mouthOpenSize, (value: number) => {

        globalMouthOpenSize.value = value * 100
      })
      
      source.onended = () => {
        lipSync.stop()
        stopWatcher()
        live2dLipSync.value = null
        globalMouthOpenSize.value = 0
        nowSpeaking.value = false
        isSpeaking.value = false
      }
    } else if (stageView.value === '3d' && !lipSyncUpdate.value) {
      const { update } = useVRMLipSync(source)
      lipSyncUpdate.value = update
      
      nowSpeaking.value = true
      
      source.onended = () => {
        nowSpeaking.value = false
        isSpeaking.value = false
      }
    } else {
      nowSpeaking.value = true
      
      source.onended = () => {
        nowSpeaking.value = false
        isSpeaking.value = false
      }
    }
    
    source.connect(audioContext.destination)
    source.start(0)
  }
  catch (error) {
    // Speech generation error removed
    isSpeaking.value = false
  }
}

function toggleAutoSpeech() {
  autoSpeechEnabled.value = !autoSpeechEnabled.value
}

async function speakLastMessage() {
  const lastAssistantMessage = messages.value
    .slice()
    .reverse()
    .find(msg => msg.role === 'assistant')
  
  if (lastAssistantMessage && lastAssistantMessage.content) {
    await generateSpeechForText(lastAssistantMessage.content as string)
  }
}


let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let currentStream: MediaStream | null = null
let recordingAudioContext: AudioContext | null = null
let audioBuffer: Float32Array[] = []
const isTranscribing = ref(false)
const recordingDuration = ref(0)
const maxRecordingDuration = 10
let recordingStartTime = 0
let recordingInterval: NodeJS.Timeout | null = null


watch([selectedAudioInput], ([deviceId]) => {
  // Microphone state monitoring removed
}, { immediate: true })


function convertFloat32ToWav(buffer: Float32Array, sampleRate: number): ArrayBuffer {
  const length = buffer.length
  const arrayBuffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(arrayBuffer)
  

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }
  
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * 2, true)
  

  let offset = 44
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]))
    view.setInt16(offset, sample * 0x7FFF, true)
    offset += 2
  }
  
  return arrayBuffer
}

async function startRecording() {
  // Recording attempt logging removed
  
  if (microphonePermission.value === 'denied') {
    // Permission denied logging removed
    alert('Разрешение на использование микрофона отклонено. Пожалуйста, разрешите доступ к микрофону в настройках браузера.')
    return
  }
  
  if (microphonePermission.value === 'prompt') {
    // Permission request logging removed
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      // Permission granted logging removed
    } catch (error) {
      // Permission error logging removed
      alert('Не удалось получить доступ к микрофону. Проверьте настройки браузера.')
      return
    }
  }
  
  try {
    
    recordingAudioContext = new AudioContext({ sampleRate: 16000 })
    audioBuffer = []
    
    // AudioContext creation logging removed
    
    currentStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        deviceId: selectedAudioInput.value ? { exact: selectedAudioInput.value } : undefined,
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      } 
    })
    
    
    const source = recordingAudioContext.createMediaStreamSource(currentStream)
    const processor = recordingAudioContext.createScriptProcessor(4096, 1, 1)
    
    processor.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer
      const inputData = inputBuffer.getChannelData(0)
      
  
      const chunk = new Float32Array(inputData.length)
      chunk.set(inputData)
      audioBuffer.push(chunk)
    }
    
    source.connect(processor)
    processor.connect(recordingAudioContext.destination)
    
    listening.value = true
    recordingStartTime = Date.now()
    recordingDuration.value = 0
    
  
    recordingInterval = setInterval(() => {
      if (recordingStartTime) {
        recordingDuration.value = (Date.now() - recordingStartTime) / 1000
      }
    }, 100)
    
    // Recording start logging removed
  } catch (error) {
    // Recording error logging removed
    alert('Ошибка при доступе к микрофону. Проверьте настройки браузера.')
  }
}

let recordingTimeout: NodeJS.Timeout | null = null

async function handleMouseDown() {
  // Mouse down logging removed
  if (!listening.value) {
    await startRecording()
    
    recordingTimeout = setTimeout(() => {
      // Recording timeout logging removed
      if (listening.value) {
        stopRecording()
      }
    }, maxRecordingDuration * 1000)
    
    const handleGlobalMouseUp = () => {
      // Global mouse up logging removed
      handleMouseUp()
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
    
    document.addEventListener('mouseup', handleGlobalMouseUp)
  }
}

async function stopRecording() {
  const actualDuration = recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0
  recordingDuration.value = actualDuration
  
  // Recording stop logging removed
  
  if (recordingTimeout) {
    clearTimeout(recordingTimeout)
    recordingTimeout = null
  }
  
  if (recordingInterval) {
    clearInterval(recordingInterval)
    recordingInterval = null
  }
  
  listening.value = false
  
  try {
    if (audioBuffer.length === 0) {
      // No audio data logging removed
      return
    }
    
  
    const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedBuffer = new Float32Array(totalLength)
    
    let offset = 0
    for (const chunk of audioBuffer) {
      combinedBuffer.set(chunk, offset)
      offset += chunk.length
    }
    
    // Combined audio buffer logging removed
    
  
    const wavBuffer = convertFloat32ToWav(combinedBuffer, 16000)
    
    // WAV conversion logging removed
    
    await handleTranscription(wavBuffer)
    
  } catch (error) {
    // Audio processing error logging removed
  } finally {
  
    if (recordingAudioContext) {
      await recordingAudioContext.close()
      recordingAudioContext = null
    }
    
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop())
      currentStream = null
    }
    
    audioBuffer = []
  }
}

async function handleMouseUp() {
  // Mouse up logging removed
  if (listening.value) {
    await stopRecording()
  }
}

async function handleMouseLeave() {
  // Mouse leave logging removed
  if (listening.value) {
    await stopRecording()
  }
}

async function handleTranscription(audioBuffer: ArrayBuffer) {
  try {
    isTranscribing.value = true
    // Transcription start logging removed
    
    const transcriptionText = await transcribeAudio(audioBuffer)
    
    // Transcription result logging removed
    
    if (transcriptionText && transcriptionText.trim()) {
      const trimmedText = transcriptionText.trim()
      
      // Transcription result logging removed
      
      try {
        const providerConfig = providersStore.getProviderConfig(activeProvider.value)
        await send(trimmedText, {
          model: activeModel.value,
          chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
          providerConfig,
        })
        // Transcription completion logging removed
      } catch (error) {
        messages.value.pop()
        messages.value.push({
          role: 'error',
          content: (error as Error).message,
        })
        // Transcription send error logging removed
      }
    } else {
      // No transcription result logging removed
    }
  } catch (error) {
     // Transcription error logging removed
   } finally {
     isTranscribing.value = false
   }
 }

onUnmounted(() => {
  // Component unmounting logging removed
  
  if (listening.value && mediaRecorder) {
    stopRecording()
  }
  
  if (currentStream) {
    currentStream.getTracks().forEach(track => {
      track.stop()
      // Media track stop logging removed
    })
    currentStream = null
  }
  
  if (mediaRecorder) {
    mediaRecorder = null
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})



onAssistantResponseEnd(async (message) => {
  if (autoSpeechEnabled.value && message) {
    await generateSpeechForText(message)
  }
})

onMounted(() => {
  
  // Component mounted logging removed
})
</script>

<template>
  <div>
    <div h-full w-full flex="~ col gap-1">
      <div w-full flex-1>
        <TamagotchiChatHistory />
      </div>
      
  
      <div flex="~ row gap-2" items-center justify-between mb-2 px-2>
        <div flex="~ row gap-2" items-center>
          <button
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
              autoSpeechEnabled
                ? 'bg-green-100 text-green-700 border-2 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
            ]"
            @click="toggleAutoSpeech"
          >
            <div :class="autoSpeechEnabled ? 'i-solar:volume-loud-bold' : 'i-solar:volume-cross-bold'" />
            <span>{{ autoSpeechEnabled ? 'Sound on' : 'Sound off' }}</span>
          </button>
          
          <div
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
              isSpeaking
                ? 'bg-orange-100 text-orange-600 border-2 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700'
                : 'bg-gray-100 text-gray-600 border-2 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
            ]"
          >
            <div :class="isSpeaking ? 'i-eos-icons:three-dots-loading' : 'i-solar:play-bold'" />
            <span>{{ isSpeaking ? 'Voicing...' : 'Voice it' }}</span>
          </div>
        </div>
        
        <div v-if="!activeSpeechProvider || !activeSpeechVoice" 
             class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
        >
          <div class="i-solar:danger-triangle-bold" />
          <span>Настройте речевой провайдер</span>
        </div>
      </div>
      
  
      <div class="relative flex items-center gap-2">
        <div class="flex-1 relative">
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            border="solid 2 primary-200/60 dark:primary-700/60"
            text="primary-700 hover:primary-800 dark:primary-100 dark:hover:primary-200 placeholder:primary-500 placeholder:hover:primary-600 placeholder:dark:primary-300 placeholder:dark:hover:primary-400"
            bg="primary-100/80 dark:primary-950/80" max-h="[15lh]" min-h="[3lh]" w-full
            flex-1 shrink-0 resize-none overflow-y-scroll rounded-xl p-4 font-medium outline-none backdrop-blur-md
            transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            @submit="handleSend"
          />
          
    
          <div v-if="listening" 
               class="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-mono"
          >
            {{ Math.max(0, maxRecordingDuration - Math.floor(recordingDuration)).toString().padStart(2, '0') }}s
          </div>
        </div>
        
  
        <button
          :class="[
            'flex-shrink-0 p-2.5 rounded-lg transition-all duration-200 shadow-sm select-none',
            listening
              ? 'bg-red-500 text-white animate-pulse shadow-red-500/25'
              : isTranscribing
                ? 'bg-yellow-500 text-white animate-spin shadow-yellow-500/25'
                : microphonePermission === 'denied'
                  ? 'bg-red-300 text-red-700 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600 shadow-blue-500/25 active:bg-blue-700'
          ]"
          :disabled="microphonePermission === 'denied' || isTranscribing"
          :title="
            listening ? 'Отпустите для остановки записи'
            : isTranscribing ? 'Обработка аудио...'
            : microphonePermission === 'denied' ? 'Разрешение на микрофон отклонено'
            : 'Нажмите и держите для записи'
          "
          @mousedown="handleMouseDown"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
        >
          <div 
            :class="
              listening ? 'i-solar:microphone-bold' 
              : isTranscribing ? 'i-eos-icons:three-dots-loading'
              : 'i-solar:microphone-2-bold'
            " 
            class="w-5 h-5" 
          />
        </button>
      </div>
    </div>
  </div>
</template>
