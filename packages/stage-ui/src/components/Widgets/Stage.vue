<script setup lang="ts">
import type { ElectronAPI } from '@electron-toolkit/preload'
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'
import type { Emotion } from '../../constants/emotions'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
// import { createTransformers } from '@proj-airi/provider-transformers'
// import embedWorkerURL from '@proj-airi/provider-transformers/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { createUnElevenLabs } from '@xsai/providers'
import { sql } from 'drizzle-orm'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMarkdown } from '../../composables/markdown'
import { useQueue } from '../../composables/queue'
import { useDelayMessageQueue, useEmotionsMessageQueue, useMessageContentQueue } from '../../composables/queues'
import { llmInferenceEndToken } from '../../constants'
import { Voice, voiceMap } from '../../constants/elevenlabs'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionAngryMotionName, EmotionHappyMotionName, EmotionThinkMotionName } from '../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useChatStore } from '../../stores/chat'
import { useSettings } from '../../stores/settings'
import Live2DScene from '../Scenes/Live2D.vue'
import VRMScene from '../Scenes/VRM.vue'

import '../../utils/live2d-zip-loader'

withDefaults(defineProps<{ paused?: boolean }>(), { paused: false })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<{ setExpression: (expression: string) => void }>()
const motion = ref<string>('')

const { stageView, elevenLabsApiKey, elevenlabsVoiceEnglish, elevenlabsVoiceJapanese } = storeToRefs(useSettings())
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const { audioContext, calculateVolume } = useAudioContext()
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, streamingMessage, onAssistantResponseEnd } = useChatStore()
const { process } = useMarkdown()
const { locale } = useI18n()

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)

const audioQueue = useQueue<{ audioBuffer: AudioBuffer, text: string }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        // Create an AudioBufferSourceNode
        const source = audioContext.createBufferSource()
        source.buffer = ctx.data.audioBuffer

        // Connect the source to the AudioContext's destination (the speakers)
        source.connect(audioContext.destination)
        // Connect the source to the analyzer
        source.connect(audioAnalyser.value!)

        // Start playing the audio
        nowSpeaking.value = true
        source.start(0)
        source.onended = () => {
          nowSpeaking.value = false
          resolve()
        }
      })
    },
  ],
})

const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      let voice = Voice.Camilla_KM
      if (locale.value === 'jp' || locale.value === 'jp-JP')
        voice = elevenlabsVoiceJapanese.value
      else
        voice = elevenlabsVoiceEnglish.value

      const now = Date.now()

      const elevenlabs = createUnElevenLabs({
        apiKey: elevenLabsApiKey.value,
        baseURL: 'https://unspeech.hyp3r.link/v1/',
      })
      const res = await generateSpeech({
        ...elevenlabs.speech('eleven_multilingual_v2', {
          voiceSettings: {
            stability: 0.4,
            similarityBoost: 0.5,
          },
        }),
        input: ctx.data,
        voice: voiceMap[voice],
      })
      const elapsed = Date.now() - now

      // eslint-disable-next-line no-console
      console.debug('TTS took', elapsed, 'ms')

      // Decode the ArrayBuffer into an AudioBuffer
      const audioBuffer = await audioContext.decodeAudioData(res)
      await audioQueue.add({ audioBuffer, text: ctx.data })
    },
  ],
})

ttsQueue.on('add', (content) => {
  // eslint-disable-next-line no-console
  console.debug('ttsQueue added', content)
})

const messageContentQueue = useMessageContentQueue(ttsQueue)

const emotionsQueue = useQueue<Emotion>({
  handlers: [
    async (ctx) => {
      if (stageView.value === '3d') {
        const value = EMOTION_VRMExpressionName_value[ctx.data]
        if (!value)
          return

        await vrmViewerRef.value!.setExpression(value)
      }
      else if (stageView.value === '2d') {
        motion.value = EMOTION_EmotionMotionName_value[ctx.data]
      }
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.debug('emotion detected', emotion)
})

const delaysQueue = useDelayMessageQueue()
delaysQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.debug('delay detected', delay)
})

function getVolumeWithMinMaxNormalizeWithFrameUpdates() {
  requestAnimationFrame(getVolumeWithMinMaxNormalizeWithFrameUpdates)
  if (!nowSpeaking.value)
    return

  mouthOpenSize.value = calculateVolume(audioAnalyser.value!, 'linear')
}

function setupLipSync() {
  if (!lipSyncStarted.value) {
    getVolumeWithMinMaxNormalizeWithFrameUpdates()
    audioContext.resume()
    lipSyncStarted.value = true
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value)
    audioAnalyser.value = audioContext.createAnalyser()
}

onBeforeMessageComposed(async () => {
  setupAnalyser()
  setupLipSync()
})

onBeforeSend(async () => {
  motion.value = EmotionThinkMotionName
})

onTokenLiteral(async (literal) => {
  await messageContentQueue.add(literal)
})

onTokenSpecial(async (special) => {
  await delaysQueue.add(special)
  await emotionMessageContentQueue.add(special)
})

onStreamEnd(async () => {
  await delaysQueue.add(llmInferenceEndToken)
})

onAssistantResponseEnd(async (_message) => {
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
})

onUnmounted(() => {
  lipSyncStarted.value = false

  const extendedWindow = window as Window & typeof globalThis & { electron?: ElectronAPI }

  extendedWindow.electron?.ipcRenderer.removeAllListeners('before-hide')
  extendedWindow.electron?.ipcRenderer.removeAllListeners('after-show')
  extendedWindow.electron?.ipcRenderer.removeAllListeners('before-quit')
})

onMounted(() => {
  const extendedWindow = window as Window & typeof globalThis & { electron?: ElectronAPI }

  extendedWindow.electron?.ipcRenderer.on('before-hide', () => {
    motion.value = EmotionAngryMotionName
  })
  extendedWindow.electron?.ipcRenderer.on('after-show', () => {
    motion.value = EmotionHappyMotionName
  })
  extendedWindow.electron?.ipcRenderer.on('before-quit', () => {
    motion.value = EmotionThinkMotionName
  })
})

onMounted(async () => {
  db.value = drizzle('duckdb-wasm://?bundles=import-url')
  await db.value.execute(sql`CREATE TABLE memory_test (vec FLOAT[768]);`)
})
</script>

<template>
  <div relative>
    <div h-full w-full>
      <Live2DScene
        v-if="stageView === '2d'"
        :motion="motion"
        :mouth-open-size="mouthOpenSize"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
      />
      <VRMScene
        v-else-if="stageView === '3d'"
        ref="vrmViewerRef"
        model="/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
        @error="console.error"
      />
    </div>
    <div
      v-if="streamingMessage.content !== ''"
      class="animate-stripe"
      absolute
      left="1/2"
      bottom="20%"
      z="20"
      rounded-2xl
      text="pink-600"
      px-2 py-2
      transform="translate-x--1/2"
    >
      <div bg="pink-50" rounded-xl px-10 py-6>
        <div class="markdown-content" v-html="process(streamingMessage.content as string)" />
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
/**
  Plunker - Untitled
  https://plnkr.co/edit/4wPv1ogKNMfJ6rQPhZdJ?p=preview&preview

  by https://stackoverflow.com/a/31547711/19954520
 */
.animate-stripe {
  background-image: repeating-linear-gradient(-45deg, #f472b6, #f472b6 25px, #f9a8d4 25px, #f9a8d4 50px);
  animation: progress 2s linear infinite;
  background-size: 150% 100%;
}

@-webkit-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-moz-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-ms-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -70px 0px;
  }
}
</style>
