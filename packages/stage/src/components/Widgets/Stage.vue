<script setup lang="ts">
import type { Emotion } from '../../constants/emotions'
import { storeToRefs } from 'pinia'

import { onUnmounted, ref } from 'vue'
import { useQueue } from '../../composables/queue'
import { useDelayMessageQueue, useEmotionsMessageQueue, useMessageContentQueue } from '../../composables/queues'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { useSpeakingStore } from '../../stores/audio'
import { useChatStore } from '../../stores/chat'
import { useLLM } from '../../stores/llm'

import { useSettings } from '../../stores/settings'
import Live2DScene from '../Scenes/Live2D.vue'
import VRMScene from '../Scenes/VRM.vue'

const live2DViewerRef = ref<{ setMotion: (motionName: string) => Promise<void> }>()
const vrmViewerRef = ref<{ setExpression: (expression: string) => void }>()

const { stageView, elevenLabsApiKey } = storeToRefs(useSettings())
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const { audioContext, calculateVolume } = useAudioContext()
const { streamSpeech } = useLLM()
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd } = useChatStore()

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
      const now = Date.now()
      const res = await streamSpeech('https://airi-api.ayaka.io', elevenLabsApiKey.value, ctx.data, {
        // voice: 'ShanShan',
        // Quite good for English
        voice: 'Myriam',
        // Beatrice is not 'childish' like the others
        // voice: 'Beatrice',
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.5,
        },
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
        await live2DViewerRef.value!.setMotion(EMOTION_EmotionMotionName_value[ctx.data])
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
  live2DViewerRef.value?.setMotion(EmotionThinkMotionName)
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

onUnmounted(() => {
  lipSyncStarted.value = false
})
</script>

<template>
  <Live2DScene
    v-if="stageView === '2d'"
    ref="live2DViewerRef"
    :mouth-open-size="mouthOpenSize"
    model="/assets/live2d/models/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json"
    w="50%" min-w="50% <lg:full" min-h="100 sm:100" h-full flex-1
  />
  <VRMScene
    v-else-if="stageView === '3d'"
    ref="vrmViewerRef"
    model="/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm"
    idle-animation="/assets/vrm/animations/idle_loop.vrma"
    w="50%" min-w="50% <lg:full" min-h="100 sm:100" h-full flex-1
    @error="console.error"
  />
</template>
